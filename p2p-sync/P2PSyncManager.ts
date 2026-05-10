// P2PSyncManager.ts - 采用连接角色协商策略和统一同步框架
import { DatabaseManager } from '../database/utils/database'
import { useSyncStore } from '../stores/useSyncStore'
import { SyncFramework } from './SyncFramework'
import { v4 as uuidv4 } from 'uuid'
import { eventBus } from '@/utils/eventBus'
import { SmartCleanupManager } from './SmartCleanupManager'
import { WorkTaskModel } from '@/database/models/WorkTaskModel'
import { AnnualTaskModel } from '@/database/models/AnnualTaskModel'
import { BudgetApplicationModel } from '@/database/models/BudgetApplicationModel'
import { ProcurementTaskModel } from '@/database/models/ProcurementTaskModel'
import { ContractModel } from '@/database/models/ContractModel'
import { DepartmentModel } from '@/database/models/DepartmentModel'
import { PaymentApplicationModel } from '@/database/models/PaymentApplicationModel'
import { ProcurementMethodModel } from '@/database/models/ProcurementMethodModel'
import { ProjectModel } from '@/database/models/ProjectModel'
import { ReimbursementTaskModel } from '@/database/models/ReimbursementTaskModel'
import { RegularPaymentModel } from '@/database/models/RegularPaymentModel'
import { SubjectModel } from '@/database/models/SubjectModel'
import { TagModel } from '@/database/models/TagModel'
import { UserModel } from '@/database/models/UserModel'
import FileManager from '@/utils/FileManager'
import { FederatedLearningManager } from '@/prediction/FederatedLearningManager'
import { ModelParameterSharing } from '@/prediction/ModelParameterSharing'

interface FileChunkStorage {
  fileId: string // 文件ID
  chunks: (ArrayBuffer | null)[] // 存储分块数据（用null占位未接收的分块）
  received: number // 已接收的分块数量
}

interface P2PConfig {
  system: {
    crossClientLearning: boolean // 控制是否启用跨客户端学习
    // 可以添加其他系统配置项
  }
  // 可以添加其他配置模块
}

export interface SyncOperation {
  id: string
  client_id: string
  table_name: string
  record_id: string // UUID
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  operation_data: any
  operation_timestamp: number
  version: number
}

export interface SyncRecordMapping {
  id: string
  source_client_id: string
  source_record_id: string // UUID
  local_record_id: string // UUID
  table_name: string
  operation_type: string
  sync_timestamp: number
}

export interface PeerConnection {
  peerId: string
  connection: RTCPeerConnection
  dataChannel: RTCDataChannel | null
  isConnected: boolean
  lastActivity: number
  role: 'initiator' | 'responder' // 连接角色
}

export class P2PSyncManager {
  private static instance: P2PSyncManager
  private db: DatabaseManager
  private syncStore: any
  private syncFramework: SyncFramework | null = null
  cleanupManager: SmartCleanupManager
  private isInitialized: boolean = false
  private fileChunks: Map<string, FileChunkStorage> = new Map()
  private federatedLearningManager: FederatedLearningManager | null = null
  private modelParameterSharing: ModelParameterSharing | null = null
  private config: P2PConfig // 原有系统配置

  // 新增连接配置属性
  private connectionConfig: {
    signalingServer: string
    roomId: string
  } = {
    signalingServer: 'ws://localhost:8080',
    roomId: 'budget-management-room',
  }
  private modelsRegistered: boolean = false

  // 内网专用配置
  private ws: WebSocket | null = null
  private clientId: string = ''

  // 连接管理
  private peerConnections: Map<string, PeerConnection> = new Map()
  private dataChannels: Map<string, RTCDataChannel> = new Map()
  private pendingOffers: Map<string, any> = new Map() // 缓存的OFFER
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 3

  // 同步管理
  private pendingOperations: string[] = [] // 存储操作ID
  private isProcessingRecords: boolean = false
  private reconnectTimer: NodeJS.Timeout | null = null

  // 清理配置
  private readonly OPERATION_LOG_RETENTION_DAYS = 30
  private readonly MAX_OPERATION_LOGS = 10000

  private isOnline: boolean = false
  private readonly BATCH_SIZE: number = 50 // 每批发送的操作数量
  private syncRetryAttempts: Map<string, number> = new Map() // 操作重试次数
  private readonly MAX_RETRY_ATTEMPTS: number = 3

  constructor(customConfig?: Partial<{ signalingServer: string; roomId: string }>) {
    this.db = DatabaseManager.getInstance()
    this.syncStore = useSyncStore()
    this.clientId = this.generateClientId()
    this.isOnline = navigator.onLine
    this.config = {
      system: {
        crossClientLearning: true,
      },
    }
    // 合并传入的连接配置
    if (customConfig) {
      this.connectionConfig = { ...this.connectionConfig, ...customConfig }
    }
    // 先创建管理器实例
    this.cleanupManager = SmartCleanupManager.getInstance()

    this.setupEventListeners()

    console.log('🔄 P2PSyncManager 构造函数完成')
  }
  /**
   * 获取同步框架实例（确保已初始化）
   */
  getSyncFramework(): SyncFramework {
    if (!this.syncFramework) {
      throw new Error('SyncFramework not initialized. Call initialize() first.')
    }
    return this.syncFramework
  }

  static getInstance(): P2PSyncManager {
    if (!P2PSyncManager.instance) {
      P2PSyncManager.instance = new P2PSyncManager()
    }
    return P2PSyncManager.instance
  }

  private setupEventListeners(): void {
    window.addEventListener('online', () => this.handleNetworkOnline())
    window.addEventListener('offline', () => this.handleNetworkOffline())

    // 监听页面可见性变化，当页面从隐藏变为可见时尝试同步
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline) {
        this.syncOfflineOperations()
      }
    })
  }

  // 新增更新连接配置的方法
  public updateConnectionConfig(
    newConfig: Partial<{ signalingServer: string; roomId: string }>,
  ): void {
    const oldServer = this.connectionConfig.signalingServer
    const oldRoom = this.connectionConfig.roomId
    Object.assign(this.connectionConfig, newConfig)
    console.log('⚙️ 连接配置已更新', this.connectionConfig)

    // 如果地址或房间变化且当前已连接，自动重连
    if (
      (newConfig.signalingServer && newConfig.signalingServer !== oldServer) ||
      (newConfig.roomId && newConfig.roomId !== oldRoom)
    ) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        console.log('🔄 配置变化，重新连接信令服务器...')
        this.disconnect()
        this.initialize().catch(console.error)
      }
    }
  }

  // 新增更新配置的方法
  public updateConfig(newConfig: Partial<{ signalingServer: string; roomId: string }>): void {
    const oldServer = this.connectionConfig.signalingServer
    const oldRoom = this.connectionConfig.roomId
    Object.assign(this.config, newConfig)
    console.log('⚙️ P2P配置已更新', this.config)

    // 如果地址或房间发生变化，且当前处于连接状态，则自动重连
    if (
      (newConfig.signalingServer && newConfig.signalingServer !== oldServer) ||
      (newConfig.roomId && newConfig.roomId !== oldRoom)
    ) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        console.log('🔄 配置变化，重新连接信令服务器...')
        this.disconnect() // 断开现有连接
        this.initialize().catch(console.error) // 重新初始化
      }
    }
  }

  /**
   * 初始化联邦学习和模型共享
   */
  private async initializeFederatedLearning(): Promise<void> {
    if (!this.config.system.crossClientLearning) return

    try {
      // 初始化联邦学习管理器
      this.federatedLearningManager = new FederatedLearningManager(this)
      await this.federatedLearningManager.initialize()

      // 初始化模型参数共享
      this.modelParameterSharing = new ModelParameterSharing(this)
      await this.modelParameterSharing.initialize()

      console.log('✅ 联邦学习和模型共享初始化完成')
    } catch (error) {
      console.error('❌ 联邦学习初始化失败:', error)
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('⏭️ P2PSyncManager 已经初始化，跳过重复初始化')

      // 如果在线但信令连接断开，只重新连接信令服务器
      if (this.isOnline && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        console.log('🔄 重新连接信令服务器...')
        await this.connectToSignalingServer()
      }
      return
    }

    try {
      console.log('🚀 启动P2P同步服务...')
      this.isOnline = navigator.onLine
      await this.db.initialize()

      // 1. 初始化同步框架（只在第一次创建）
      if (!this.syncFramework) {
        this.syncFramework = new SyncFramework(this.db, this.clientId)
        this.syncFramework.initialize()
      }

      // 2. 只在第一次初始化时注册Model
      if (!this.modelsRegistered) {
        this.registerAllModels()
        this.modelsRegistered = true
      }

      // 3. 设置管理器依赖
      this.cleanupManager.setSyncManager(this)

      // 4. 初始化清理管理器（幂等操作）
      await this.cleanupManager.initialize()

      // 5. 初始化联邦学习和模型共享（幂等操作）
      await this.initializeFederatedLearning()

      // 6. 如果在线，连接信令服务器
      if (this.isOnline) {
        await this.connectToSignalingServer()
      } else {
        console.log('🌐 当前离线模式，等待网络恢复')
      }

      this.isInitialized = true
      console.log('✅ P2PSyncManager 初始化完成')
    } catch (error) {
      console.error('❌ P2P同步初始化失败:', error)
      this.scheduleReconnect()
    }
  }

  /**
   * 注册所有Model实例到同步框架
   */
  private registerAllModels(): void {
    if (!this.syncFramework) return

    // 🆕 注册文件管理器作为文件表的处理器
    const fileManager = new FileManager()
    this.syncFramework.registerModel('files', fileManager)

    // 注册工作任务Model
    const workTaskModel = new WorkTaskModel()
    this.syncFramework.registerModel('work_tasks', workTaskModel)

    // 注册年度任务Model
    const annualTaskModel = new AnnualTaskModel()
    this.syncFramework.registerModel('annual_tasks', annualTaskModel)

    const budgetApplicationModel = new BudgetApplicationModel()
    this.syncFramework.registerModel('budget_applications', budgetApplicationModel)

    const procurementTaskModel = new ProcurementTaskModel()
    this.syncFramework.registerModel('procurement_tasks', procurementTaskModel)

    const contractModel = new ContractModel()
    this.syncFramework.registerModel('contracts', contractModel)

    const departmentModel = new DepartmentModel()
    this.syncFramework.registerModel('departments', departmentModel)

    const paymentApplicationModel = new PaymentApplicationModel()
    this.syncFramework.registerModel('payment_applications', paymentApplicationModel)

    const procurementMethodModel = new ProcurementMethodModel()
    this.syncFramework.registerModel('procurement_methods', procurementMethodModel)

    const projectModel = new ProjectModel()
    this.syncFramework.registerModel('projects', projectModel)

    const reimbursementTaskModel = new ReimbursementTaskModel()
    this.syncFramework.registerModel('reimbursement_tasks', reimbursementTaskModel)

    const regularPaymentModel = new RegularPaymentModel()
    this.syncFramework.registerModel('regular_payment_plans', regularPaymentModel)

    const subjectModel = new SubjectModel()
    this.syncFramework.registerModel('subjects', subjectModel)

    const tagModel = new TagModel()
    this.syncFramework.registerModel('tags', tagModel)

    const userModel = new UserModel()
    this.syncFramework.registerModel('users', userModel)

    console.log('✅ 所有业务Model实例已注册到同步框架')
  }

  private async connectToSignalingServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        return resolve()
      }

      console.log(`🔗 连接信令服务器: ${this.connectionConfig.signalingServer}`)
      this.ws = new WebSocket(this.connectionConfig.signalingServer)

      const timeout = setTimeout(() => {
        reject(new Error('连接超时'))
      }, 5000)

      this.ws.onopen = () => {
        clearTimeout(timeout)
        console.log('✅ 信令服务器连接成功')
        this.reconnectAttempts = 0 // 重置重连计数
        this.reconnectTimer = null // 清除重连定时器
        this.syncStore.setConnectionStatus('connected')
        resolve()
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleSignalingMessage(message)
        } catch (error) {
          console.error('❌ 信令消息解析失败:', error)
        }
      }

      this.ws.onclose = () => {
        clearTimeout(timeout)
        console.log('🔌 信令连接关闭')
        this.syncStore.setConnectionStatus('disconnected')
        this.cleanupPeerConnections()
        this.scheduleReconnect()
      }

      this.ws.onerror = (error) => {
        clearTimeout(timeout)
        console.error('❌ 信令服务器错误:', error)
        reject(error)
      }
    })
  }

  private handleSignalingMessage(message: any): void {
    switch (message.type) {
      case 'welcome':
        this.clientId = message.clientId
        console.log(`🆔 客户端ID: ${this.clientId}`)
        this.joinRoom()
        break
      case 'room-joined':
        this.handleRoomJoined(message)
        break
      case 'user-joined':
        this.handleUserJoined(message)
        break
      case 'user-left':
        this.handleUserLeft(message)
        break
      case 'offer':
        this.handleOffer(message)
        break
      case 'answer':
        this.handleAnswer(message)
        break
      case 'candidate':
        this.handleCandidate(message)
        break
    }
  }

  private joinRoom(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'join',
          roomId: this.connectionConfig.roomId,
        }),
      )
      console.log(`🚪 加入房间: ${this.connectionConfig.roomId}`)
    }
  }

  private handleRoomJoined(message: any): void {
    console.log(`✅ 加入房间成功: ${message.roomId}`)
    this.syncStore.setRoomInfo(message.roomId, message.members)

    // 连接到现有成员 - 采用角色协商
    message.members.forEach((member: any) => {
      if (member.clientId !== this.clientId) {
        this.initiateConnection(member.clientId)
      }
    })
  }

  private handleUserJoined(message: any): void {
    console.log(`🆕 新用户加入: ${message.clientId}`)
    this.syncStore.addPeer(message.clientId)
    this.initiateConnection(message.clientId)
  }

  private handleUserLeft(message: any): void {
    console.log(`👋 用户离开: ${message.clientId}`)
    this.syncStore.removePeer(message.clientId)
    this.closePeerConnection(message.clientId)
  }

  /**
   * 连接角色协商 - 决定谁发起连接
   */
  private shouldInitiateConnection(peerId: string): boolean {
    // 简单的规则：ID较小的客户端发起连接
    return this.clientId < peerId
  }

  private initiateConnection(peerId: string): void {
    if (this.peerConnections.has(peerId)) {
      console.log(`✅ 已存在与 ${peerId} 的连接`)
      return
    }

    if (this.shouldInitiateConnection(peerId)) {
      console.log(`🎯 ${this.clientId} 将发起与 ${peerId} 的连接`)
      this.createPeerConnectionAsInitiator(peerId)
    } else {
      console.log(`⏳ ${this.clientId} 将等待 ${peerId} 发起连接`)
      this.syncStore.updatePeerStatus(peerId, 'waiting')
    }
  }

  /**
   * 作为发起方创建连接
   */
  private async createPeerConnectionAsInitiator(peerId: string): Promise<void> {
    try {
      const configuration: RTCConfiguration = {
        iceServers: [], // 纯内网
      }

      const peerConnection = new RTCPeerConnection(configuration)

      // 创建数据通道
      const dataChannel = peerConnection.createDataChannel('sync-data', {
        ordered: true,
      })

      const peerConn: PeerConnection = {
        peerId,
        connection: peerConnection,
        dataChannel,
        isConnected: false,
        lastActivity: Date.now(),
        role: 'initiator',
      }

      this.peerConnections.set(peerId, peerConn)
      this.syncStore.updatePeerStatus(peerId, 'connecting')

      // 设置事件监听
      this.setupDataChannel(peerConn)
      this.setupPeerConnectionEvents(peerConn)

      // 创建并发送OFFER
      await this.createAndSendOffer(peerConn)
    } catch (error) {
      console.error(`❌ 发起连接失败: ${peerId}`, error)
      this.syncStore.updatePeerStatus(peerId, 'error')
      this.closePeerConnection(peerId)
    }
  }

  /**
   * 作为响应方创建连接
   */
  private async createPeerConnectionAsResponder(peerId: string, offer: any): Promise<void> {
    try {
      const configuration: RTCConfiguration = {
        iceServers: [],
      }

      const peerConnection = new RTCPeerConnection(configuration)

      const peerConn: PeerConnection = {
        peerId,
        connection: peerConnection,
        dataChannel: null,
        isConnected: false,
        lastActivity: Date.now(),
        role: 'responder',
      }

      this.peerConnections.set(peerId, peerConn)
      this.syncStore.updatePeerStatus(peerId, 'connecting')

      // 设置事件监听
      this.setupPeerConnectionEvents(peerConn)

      // 设置远程OFFER
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))

      // 创建并发送ANSWER
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)

      console.log(`📤 发送ANSWER到 ${peerId}`)
      this.sendSignalingMessage({
        type: 'answer',
        targetClientId: peerId,
        answer: answer,
      })
    } catch (error) {
      console.error(`❌ 响应连接失败: ${peerId}`, error)
      this.closePeerConnection(peerId)
    }
  }

  private async createAndSendOffer(peerConn: PeerConnection): Promise<void> {
    try {
      const offer = await peerConn.connection.createOffer()
      await peerConn.connection.setLocalDescription(offer)

      console.log(`📤 发送OFFER到 ${peerConn.peerId}`)

      this.sendSignalingMessage({
        type: 'offer',
        targetClientId: peerConn.peerId,
        offer: offer,
      })
    } catch (error) {
      console.error(`❌ 创建OFFER失败:`, error)
      throw error
    }
  }

  private setupDataChannel(peerConn: PeerConnection): void {
    if (!peerConn.dataChannel) return

    const dc = peerConn.dataChannel

    dc.onopen = () => {
      console.log(`✅ 数据通道已打开: ${peerConn.peerId}`)
      peerConn.isConnected = true
      peerConn.lastActivity = Date.now()
      this.syncStore.updatePeerStatus(peerConn.peerId, 'connected')
      this.dataChannels.set(peerConn.peerId, dc)

      // 连接建立后，立即同步错过的操作
      this.requestMissedOperations(peerConn.peerId)
      this.syncOfflineOperations()
    }

    dc.onmessage = (event) => {
      try {
        peerConn.lastActivity = Date.now()
        const message = JSON.parse(event.data)
        this.handleDataChannelMessage(peerConn.peerId, message)
      } catch (error) {
        console.error(`❌ 处理数据通道消息失败:`, error)
      }
    }

    dc.onclose = () => {
      console.log(`🔌 数据通道关闭: ${peerConn.peerId}`)
      peerConn.isConnected = false
      this.dataChannels.delete(peerConn.peerId)
      this.syncStore.updatePeerStatus(peerConn.peerId, 'disconnected')
    }

    dc.onerror = (error) => {
      console.error(`❌ 数据通道错误: ${peerConn.peerId}`, error)
    }
  }

  private setupPeerConnectionEvents(peerConn: PeerConnection): void {
    const pc = peerConn.connection

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`❄️  发送ICE候选到 ${peerConn.peerId}`)
        this.sendSignalingMessage({
          type: 'candidate',
          targetClientId: peerConn.peerId,
          candidate: event.candidate,
        })
      } else {
        console.log(`✅ ${peerConn.peerId} 的ICE收集完成`)
      }
    }

    pc.ondatachannel = (event) => {
      console.log(`📡 收到数据通道: ${peerConn.peerId}`)
      const dataChannel = event.channel
      peerConn.dataChannel = dataChannel
      this.setupDataChannel(peerConn)
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      console.log(`🔗 ${peerConn.peerId} 连接状态: ${state}`)

      switch (state) {
        case 'connected':
          console.log(`🎉 与 ${peerConn.peerId} 的P2P连接已建立`)
          peerConn.isConnected = true
          this.syncStore.updatePeerStatus(peerConn.peerId, 'connected')
          break
        case 'disconnected':
          console.warn(`⚠️  与 ${peerConn.peerId} 的连接断开`)
          peerConn.isConnected = false
          this.syncStore.updatePeerStatus(peerConn.peerId, 'disconnected')
          break
        case 'failed':
          console.error(`❌ 与 ${peerConn.peerId} 的连接失败`)
          peerConn.isConnected = false
          this.syncStore.updatePeerStatus(peerConn.peerId, 'error')
          this.scheduleReconnectToPeer(peerConn.peerId)
          break
        case 'connecting':
          this.syncStore.updatePeerStatus(peerConn.peerId, 'connecting')
          break
        case 'closed':
          this.closePeerConnection(peerConn.peerId)
          break
      }
    }

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState
      console.log(`🧊 ${peerConn.peerId} ICE状态: ${iceState}`)

      if (iceState === 'connected' || iceState === 'completed') {
        console.log(`✅ ${peerConn.peerId} ICE连接建立`)
      } else if (iceState === 'failed') {
        console.warn(`❌ ${peerConn.peerId} ICE连接失败`)
        this.scheduleReconnectToPeer(peerConn.peerId)
      }
    }
  }

  private async handleOffer(message: any): Promise<void> {
    const peerId = message.senderClientId

    // 检查角色：如果应该由我们发起连接，忽略对方的OFFER
    if (this.shouldInitiateConnection(peerId)) {
      console.log(`⚠️  忽略来自 ${peerId} 的OFFER（应由我们发起连接）`)
      return
    }

    console.log(`📨 收到OFFER: ${peerId}`)

    // 检查是否已存在连接
    if (this.peerConnections.has(peerId)) {
      const existing = this.peerConnections.get(peerId)!
      if (existing.connection.signalingState !== 'closed') {
        console.warn(`⚠️  已存在连接: ${peerId}`)
        return
      }
      this.closePeerConnection(peerId)
    }

    // 作为响应方创建连接
    await this.createPeerConnectionAsResponder(peerId, message.offer)
  }

  private async handleAnswer(message: any): Promise<void> {
    const peerId = message.senderClientId
    const peerConn = this.peerConnections.get(peerId)

    console.log(`📨 收到ANSWER: ${peerId}`)

    if (!peerConn) {
      console.warn(`❌ 找不到连接: ${peerId}`)
      return
    }

    try {
      await peerConn.connection.setRemoteDescription(new RTCSessionDescription(message.answer))
      console.log(`✅ 设置远程ANSWER: ${peerId}`)
    } catch (error) {
      console.error(`❌ 处理ANSWER失败: ${peerId}`, error)
      this.closePeerConnection(peerId)
    }
  }

  private async handleCandidate(message: any): Promise<void> {
    const peerId = message.senderClientId
    const peerConn = this.peerConnections.get(peerId)

    if (!peerConn || !message.candidate) {
      return
    }

    try {
      const candidate = new RTCIceCandidate(message.candidate)
      await peerConn.connection.addIceCandidate(candidate)
      console.log(`✅ 添加ICE候选: ${peerId}`)
    } catch (error) {
      console.warn(`⚠️  添加ICE候选失败: ${peerId}`, error)
      // 对于候选添加失败，通常可以忽略，因为可能已经有更好的候选
    }
  }

  /**
   * 处理文件内容请求
   */
  private async handleFileContentRequest(peerId: string, message: any): Promise<void> {
    const { fileId, requestId } = message
    console.log(`📨 收到文件内容请求: ${fileId} 来自 ${peerId}`)

    try {
      const fileManager = FileManager.getInstance()

      // 下载文件
      const { file, metadata } = await fileManager.downloadFile(fileId)

      // 将文件转换为ArrayBuffer
      const arrayBuffer = await file.arrayBuffer()

      // 分块发送文件内容（避免消息过大）
      const chunkSize = 64 * 1024 // 64KB
      const totalChunks = Math.ceil(arrayBuffer.byteLength / chunkSize)

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize
        const end = Math.min(start + chunkSize, arrayBuffer.byteLength)
        const chunk = arrayBuffer.slice(start, end)

        this.sendDataToPeer(peerId, {
          type: 'file-chunk',
          fileId,
          requestId,
          chunkIndex: i,
          totalChunks,
          data: this.arrayBufferToBase64(chunk),
        })

        // 添加小延迟避免阻塞
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      // 发送完成消息
      this.sendDataToPeer(peerId, {
        type: 'file-complete',
        fileId,
        requestId,
      })

      console.log(`✅ 文件内容已发送: ${metadata.original_name}`)
    } catch (error) {
      console.error(`❌ 处理文件内容请求失败: ${fileId}`, error)

      // 关键修复：先判断 error 类型，再获取 message
      const errorMessage =
        error instanceof Error
          ? error.message // 如果是 Error 实例，直接取 message
          : String(error) // 否则转为字符串（处理非 Error 类型的错误）

      // 发送错误消息
      this.sendDataToPeer(peerId, {
        type: 'file-error',
        fileId,
        requestId,
        error: errorMessage, // 使用处理后的 errorMessage
      })
    }
  }
  /**
   * 处理文件块接收
   */
  private async handleFileChunk(peerId: string, message: any): Promise<void> {
    const { fileId, requestId, chunkIndex, totalChunks, data } = message

    // 初始化文件块存储
    if (!this.fileChunks.has(requestId)) {
      this.fileChunks.set(requestId, {
        fileId,
        chunks: new Array(totalChunks),
        received: 0,
      })
    }

    const fileData = this.fileChunks.get(requestId)!

    // 存储块数据
    fileData.chunks[chunkIndex] = this.base64ToArrayBuffer(data)
    fileData.received++

    console.log(`📦 收到文件块 ${chunkIndex + 1}/${totalChunks} (${fileId})`)

    // 检查是否所有块都已接收
    if (fileData.received === totalChunks) {
      await this.reconstructFile(fileData, requestId)
    }
  }

  /**
   * 重建文件
   */
  private async reconstructFile(fileData: any, requestId: string): Promise<void> {
    try {
      // 合并所有块
      const totalLength = fileData.chunks.reduce(
        (sum: number, chunk: ArrayBuffer) => sum + chunk.byteLength,
        0,
      )
      const result = new Uint8Array(totalLength)
      let offset = 0

      for (const chunk of fileData.chunks) {
        result.set(new Uint8Array(chunk), offset)
        offset += chunk.byteLength
      }

      // 获取文件元数据
      const fileManager = FileManager.getInstance()
      const metadata = await fileManager.getFileMetadata(fileData.fileId)

      if (!metadata) {
        throw new Error('文件元数据不存在')
      }

      // 保存文件到IndexedDB
      const blob = new Blob([result.buffer], { type: metadata.mime_type })
      const file = new File([blob], metadata.original_name, { type: metadata.mime_type })

      await fileManager.storeFileInIndexedDB(metadata.indexed_db_key, file)

      console.log(`✅ 文件重建完成: ${metadata.original_name}`)

      // 清理临时存储
      this.fileChunks.delete(requestId)
    } catch (error) {
      console.error(`❌ 文件重建失败:`, error)
      this.fileChunks.delete(requestId)
    }
  }

  // 工具方法
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }

  private sendSignalingMessage(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  private scheduleReconnectToPeer(peerId: string): void {
    setTimeout(() => {
      if (this.ws?.readyState === WebSocket.OPEN && this.syncStore.isConnected) {
        console.log(`🔄 重新连接到 ${peerId}`)
        this.initiateConnection(peerId)
      }
    }, 5000)
  }

  private closePeerConnection(peerId: string): void {
    const peerConn = this.peerConnections.get(peerId)
    if (peerConn) {
      console.log(`🗑️ 关闭连接: ${peerId}`)
      if (peerConn.dataChannel) {
        peerConn.dataChannel.close()
      }
      if (peerConn.connection) {
        peerConn.connection.close()
      }
      this.peerConnections.delete(peerId)
      this.dataChannels.delete(peerId)
    }
    this.syncStore.removePeer(peerId)
  }

  private handleDataChannelMessage(peerId: string, message: any): void {
    console.log(`📨 收到数据通道消息来自 ${peerId}:`, message.type)

    try {
      switch (message.type) {
        case 'sync-operation':
          this.handleIncomingOperation(message.operation)
          break
        case 'sync-request':
          this.handleSyncRequest(peerId, message)
          break
        case 'sync-operations-batch': // 添加这个case
          this.handleSyncOperationsBatch(peerId, message)
          break
        case 'model-update':
          this.emit('model-update', { update: message.update, sender: peerId })
          break
        case 'global-model-update':
          this.emit('global-model-update', { model: message.model, sender: peerId })
          break
        case 'model-share':
          this.emit('model-share', { model: message.model, sender: peerId })
          break
        case 'model-request':
          this.emit('model-request', {
            modelType: message.modelType,
            taskType: message.taskType,
            requester: message.requester,
          })
          break
        case 'model-response': // 新增消息类型
          this.emit('model-response', {
            requestId: message.requestId,
            model: message.model,
            sender: peerId,
          })
          break
        case 'aggregation-request': // 新增消息类型
          this.emit('aggregation-request', {
            modelType: message.modelType,
            taskType: message.taskType,
            requester: message.requester,
            timestamp: message.timestamp,
          })
          break
        case 'ping':
          this.sendDataToPeer(peerId, { type: 'pong', timestamp: Date.now() })
          break
        case 'pong':
          console.log(`🏓 收到PONG: ${peerId}`)
          break
        // 添加文件同步相关消息处理
        case 'file-request':
          this.handleFileContentRequest(peerId, message)
          break
        case 'file-chunk':
          this.handleFileChunk(peerId, message)
          break
        case 'file-complete':
          console.log(`✅ 文件传输完成: ${message.fileId}`)
          break
        case 'file-error':
          console.error(`❌ 文件传输错误: ${message.fileId}`, message.error)
          break
        case 'connection-test':
          this.sendDataToPeer(peerId, {
            type: 'connection-test-response',
            testId: message.testId,
            timestamp: Date.now(),
          })
          break
        case 'connection-test-response':
          console.log(`✅ 连接测试响应: ${peerId}, testId: ${message.testId}`)
          break
        default:
          console.warn(`❓ 未知数据通道消息类型: ${message.type}`)
      }
    } catch (error) {
      console.error(`❌ 处理数据通道消息失败 (${peerId}):`, error)
    }
  }

  /**
   * 广播消息给所有对等节点
   */
  async broadcastMessage(message: any): Promise<void> {
    const connectedPeers = Array.from(this.dataChannels.keys())

    for (const peerId of connectedPeers) {
      try {
        this.sendDataToPeer(peerId, message)
      } catch (error) {
        console.error(`广播消息到 ${peerId} 失败:`, error)
      }
    }
  }

  /**
   * 发送消息给特定客户端
   */
  async sendMessageToClient(clientId: string, message: any): Promise<void> {
    this.sendDataToPeer(clientId, message)
  }

  /**
   * 获取联邦学习管理器
   */
  getFederatedLearningManager(): FederatedLearningManager | null {
    return this.federatedLearningManager
  }

  /**
   * 获取模型参数共享管理器
   */
  getModelParameterSharing(): ModelParameterSharing | null {
    return this.modelParameterSharing
  }

  /**
   * 获取客户端ID
   */
  getClientId(): string {
    return this.clientId
  }

  // 事件发射器方法
  private events: Map<string, Function[]> = new Map()

  on(event: string, listener: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, [])
    }
    this.events.get(event)!.push(listener)
  }

  emit(event: string, data: any): void {
    const listeners = this.events.get(event) || []
    listeners.forEach((listener) => {
      try {
        listener(data)
      } catch (error) {
        console.error(`事件处理错误 (${event}):`, error)
      }
    })
  }

  /**
   * 处理批量同步操作
   */
  private async handleSyncOperationsBatch(peerId: string, message: any): Promise<void> {
    const { operations, batch_index, total_batches } = message

    console.log(
      `📦 收到批量操作来自 ${peerId}: 批次 ${batch_index + 1}/${total_batches}, 操作数量: ${operations.length}`,
    )

    try {
      // 使用同步框架的批量处理方法
      const results = await this.getSyncFramework().applySyncOperationsBatch(operations)

      const successCount = results.filter((success) => success).length
      const failedCount = results.filter((success) => !success).length

      console.log(`✅ 批量操作处理完成: ${peerId}, 成功: ${successCount}, 失败: ${failedCount}`)

      if (failedCount > 0) {
        console.warn(`⚠️  ${failedCount} 个操作处理失败`)
      }
    } catch (error) {
      console.error(`❌ 处理批量操作失败 (${peerId}):`, error)
    }
  }
  // 生成会话ID的方法
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  /**
   * 测试数据通道连接
   */
  public async testDataChannelConnection(peerId: string): Promise<boolean> {
    const dataChannel = this.dataChannels.get(peerId)

    if (!dataChannel) {
      console.warn(`❌ 数据通道不存在: ${peerId}`)
      return false
    }

    if (dataChannel.readyState !== 'open') {
      console.warn(`❌ 数据通道未打开: ${peerId}, 状态: ${dataChannel.readyState}`)
      return false
    }

    return new Promise((resolve) => {
      const testId = this.generateSessionId()
      const testMessage = {
        type: 'connection-test',
        timestamp: Date.now(),
        clientId: this.clientId,
        testId: testId,
      }

      const timeout = setTimeout(() => {
        console.warn(`⏰ 连接测试超时: ${peerId}`)
        resolve(false)
      }, 5000)

      // 设置一次性响应监听器
      const responseHandler = (message: any) => {
        if (message.type === 'connection-test-response' && message.testId === testId) {
          clearTimeout(timeout)
          resolve(true)
        }
      }

      // 临时添加监听器
      this.on('connection-test-response', responseHandler)

      // 发送测试消息
      const success = this.sendDataToPeer(peerId, testMessage)

      if (!success) {
        clearTimeout(timeout)
        resolve(false)
      }

      // 超时后清理监听器
      setTimeout(() => {
        // 移除监听器的实现需要补充
      }, 5000)
    })
  }

  /**
   * 检查对等节点连接质量
   */
  public async checkPeerConnectionQuality(peerId: string): Promise<{
    dataChannelOpen: boolean
    lastActivity: number
    connectionState: string
    iceState: string
  }> {
    const peerConn = this.peerConnections.get(peerId)
    const dataChannel = this.dataChannels.get(peerId)

    if (!peerConn) {
      return {
        dataChannelOpen: false,
        lastActivity: 0,
        connectionState: 'not_found',
        iceState: 'not_found',
      }
    }

    return {
      dataChannelOpen: dataChannel?.readyState === 'open',
      lastActivity: peerConn.lastActivity,
      connectionState: peerConn.connection.connectionState,
      iceState: peerConn.connection.iceConnectionState,
    }
  }

  /**
   * 处理接收到的同步操作 - 使用统一框架
   */
  private async handleIncomingOperation(operation: SyncOperation): Promise<void> {
    // 跳过自己发送的操作
    if (operation.client_id === this.clientId) {
      console.log(`⏭️  跳过自己的操作: ${operation.id}`)
      return
    }

    console.log(`🔄 处理来自 ${operation.client_id} 的操作:`, {
      table: operation.table_name,
      operation: operation.operation,
      recordId: operation.record_id,
    })

    try {
      // 检查是否已经处理过这个操作
      if (await this.isOperationProcessed(operation.id)) {
        console.log(`⏭️  跳过已处理的操作: ${operation.id}`)
        return
      }

      // 使用同步框架应用操作
      const success = await this.getSyncFramework().applySyncOperation(operation)

      if (success) {
        // 标记为已处理
        await this.markOperationAsProcessed(operation)
        this.syncStore.incrementRecordsReceived()

        // 发送Store更新事件
        this.emitStoreUpdateEvent(operation)

        console.log(`✅ 同步操作应用成功: ${operation.id}`)
      }
    } catch (error) {
      console.error(`❌ 应用同步操作失败:`, error)
    }
  }

  /**
   * 发送Store更新事件
   */
  private emitStoreUpdateEvent(operation: SyncOperation): void {
    const event = {
      table: operation.table_name,
      operation: operation.operation,
      recordId: operation.record_id,
      data: operation.operation_data?.new_data,
      // 添加分页上下文信息
      paginationContext: {
        affectsCurrentPage: this.shouldRefreshCurrentPage(operation),
      },
    }

    // 发送到事件总线
    eventBus.emit('store-update', event)

    // 同时发送特定表的事件
    eventBus.emit(`store-update:${operation.table_name}`, event)

    console.log(`📢 发送Store更新事件:`, event)
  }

  /**
   * 判断操作是否影响当前页
   */
  private shouldRefreshCurrentPage(operation: SyncOperation): boolean {
    // 这里可以根据业务逻辑判断操作是否可能影响当前显示页面的数据
    // 例如：INSERT操作总是需要刷新，UPDATE/DELETE操作如果涉及当前页记录则需要刷新

    // 简化实现：总是返回true，让Store决定是否刷新
    return true
  }

  /**
   * 请求错过的操作（用于客户端重新上线时同步）
   */
  private requestMissedOperations(peerId: string): void {
    // 获取最后一次同步时间
    const lastSyncTime = this.getLastSyncTime()

    console.log(`📡 向 ${peerId} 请求错过的操作，自从: ${new Date(lastSyncTime).toLocaleString()}`)

    this.sendDataToPeer(peerId, {
      type: 'sync-request',
      since_timestamp: lastSyncTime,
    })
  }

  /**
   * 处理同步请求
   */
  private async handleSyncRequest(peerId: string, message: any): Promise<void> {
    const { since_timestamp } = message
    console.log(
      `📥 处理来自 ${peerId} 的同步请求，自从: ${new Date(since_timestamp).toLocaleString()}`,
    )

    // 获取错过的操作
    const missedOperations = await this.getOperationsSince(since_timestamp)
    console.log(`📤 发送 ${missedOperations.length} 个错过的操作到 ${peerId}`)

    // 分批发送操作，避免消息过大
    const batchSize = 50
    for (let i = 0; i < missedOperations.length; i += batchSize) {
      const batch = missedOperations.slice(i, i + batchSize)

      this.sendDataToPeer(peerId, {
        type: 'sync-operations-batch',
        operations: batch,
        batch_index: i / batchSize,
        total_batches: Math.ceil(missedOperations.length / batchSize),
      })

      // 小延迟以避免网络拥塞
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  /**
   * 记录数据变更操作 - 使用统一框架
   */
  public async recordChange(
    tableName: string,
    recordId: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    oldData?: any,
    newData?: any,
  ): Promise<void> {
    const operationId = await this.getSyncFramework().recordChange(
      tableName,
      recordId,
      operation,
      oldData,
      newData,
    )

    if (operationId) {
      this.pendingOperations.push(operationId)
      this.syncStore.incrementRecordsSent()

      // 如果在线，立即处理；如果离线，等待网络恢复后自动同步
      if (this.isOnline && this.dataChannels.size > 0) {
        this.processPendingOperations()
      } else {
        console.log(`📝 记录离线操作: ${tableName} ${operation} ${recordId}`)
      }
    }
  }

  /**
   * 获取同步统计信息
   */
  public getSyncStats(): any {
    if (!this.isInitialized) {
      return {
        clientId: this.clientId,
        isInitialized: false,
        error: 'P2PSyncManager not initialized',
      }
    }

    const connectedPeers = Array.from(this.peerConnections.values()).filter(
      (peer) => peer.isConnected,
    ).length

    return {
      clientId: this.clientId,
      connectedPeers,
      totalPeers: this.peerConnections.size,
      pendingOperations: this.pendingOperations.length,
      isOnline: this.isOnline,
      roomId: this.connectionConfig.roomId,
      syncFramework: this.getSyncFramework().getSyncStats(),
      cleanup: this.cleanupManager.getCleanupStatus(),
      isInitialized: this.isInitialized,
    }
  }

  /**
   * 手动触发清理
   */
  public async manualCleanup(): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('P2PSyncManager not initialized. Call initialize() first.')
    }
    return await this.cleanupManager.manualCleanup()
  }
  /**
   * 处理待同步操作
   */
  async processPendingOperations(): Promise<void> {
    if (this.isProcessingRecords || this.pendingOperations.length === 0) return

    this.isProcessingRecords = true

    try {
      const connectedPeers = Array.from(this.dataChannels.keys())

      console.log(
        `📤 准备同步 ${this.pendingOperations.length} 条操作到 ${connectedPeers.length} 个对等节点`,
      )

      if (connectedPeers.length === 0) {
        console.log(`⏳ 没有已连接的对等节点，暂缓同步`)
        return
      }

      // 获取操作详情
      const operations = await this.getOperationsByIds(this.pendingOperations)

      for (const operation of operations) {
        for (const peerId of connectedPeers) {
          console.log(`📤 发送同步操作到 ${peerId}:`, {
            table: operation.table_name,
            operation: operation.operation,
            recordId: operation.record_id,
          })

          this.sendDataToPeer(peerId, {
            type: 'sync-operation',
            operation: operation,
          })
        }

        // 标记为已同步
        await this.markOperationAsProcessed(operation)
      }

      // 清空已发送的操作
      this.pendingOperations = []
      console.log(`✅ 所有待同步操作已发送`)
    } catch (error) {
      console.error('❌ 处理待同步操作失败:', error)
    } finally {
      this.isProcessingRecords = false
    }
  }

  sendDataToPeer(peerId: string, data: any): boolean {
    const dataChannel = this.dataChannels.get(peerId)

    if (!dataChannel) {
      console.warn(`⚠️ 数据通道不存在: ${peerId}`)
      return false
    }

    if (dataChannel.readyState !== 'open') {
      console.warn(`⚠️ 数据通道未打开: ${peerId}, 状态: ${dataChannel.readyState}`)
      return false
    }

    try {
      const messageString = JSON.stringify(data)
      dataChannel.send(messageString)
      console.log(`📤 发送数据到 ${peerId}:`, data.type)
      return true
    } catch (error) {
      console.error(`❌ 发送数据到 ${peerId} 失败:`, error)
      return false
    }
  }

  // 数据持久化方法
  private async markOperationAsProcessed(operation: SyncOperation): Promise<void> {
    try {
      await this.db.updateSyncOperationStatus(operation.id, 'synced')
    } catch (error) {
      console.error('标记操作为已处理失败:', error)
    }
  }

  private async isOperationProcessed(operationId: string): Promise<boolean> {
    try {
      return this.db.isOperationProcessed(operationId)
    } catch (error) {
      console.error('检查操作是否已处理失败:', error)
      return false
    }
  }

  private async getOperationsSince(timestamp: number): Promise<SyncOperation[]> {
    try {
      const logs = this.db.getOperationsSince(timestamp)

      // 过滤掉可能导致软删除记录恢复的操作
      const filteredLogs = logs.filter((log: any) => {
        // 这里可以添加更复杂的过滤逻辑
        // 例如：排除对已知软删除记录的UPDATE操作
        return true // 暂时不过滤，依靠应用层的保护
      })

      return filteredLogs.map((log: any) => ({
        id: log.id,
        client_id: log.client_id,
        table_name: log.table_name,
        record_id: log.record_id,
        operation: log.operation,
        operation_data: JSON.parse(log.operation_data),
        operation_timestamp: log.operation_timestamp,
        version: 1,
      }))
    } catch (error) {
      console.error('获取操作失败:', error)
      return []
    }
  }

  private async getOperationsByIds(operationIds: string[]): Promise<SyncOperation[]> {
    if (operationIds.length === 0) {
      return []
    }

    try {
      // 构建参数占位符，例如: ?, ?, ?
      const placeholders = operationIds.map(() => '?').join(',')
      const sql = `SELECT * FROM sync_operation_logs WHERE id IN (${placeholders})`

      // 执行查询
      const logs = this.db.query(sql, operationIds)

      // 转换为 SyncOperation 格式
      return logs.map((log: any) => ({
        id: log.id,
        client_id: log.client_id,
        table_name: log.table_name,
        record_id: log.record_id,
        operation: log.operation,
        operation_data: JSON.parse(log.operation_data),
        operation_timestamp: log.operation_timestamp,
        version: 1,
      }))
    } catch (error) {
      console.error('根据ID获取操作失败:', error)
      return []
    }
  }

  private getLastSyncTime(): number {
    // 从本地存储获取最后一次同步时间
    const lastSync = localStorage.getItem('last-sync-time')
    return lastSync ? parseInt(lastSync) : Date.now() - 24 * 60 * 60 * 1000 // 默认24小时前
  }

  /**
   * 清理过期的操作日志
   */
  public async cleanupOperationLogs(): Promise<void> {
    try {
      await this.db.cleanupExpiredOperationLogs(this.OPERATION_LOG_RETENTION_DAYS)
      console.log(`🧹 清理过期的操作日志完成`)
    } catch (error) {
      console.error('清理操作日志失败:', error)
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++

    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 40000)
    console.log(`🔄 ${delay}ms后重连 (第${this.reconnectAttempts}次)`)

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectTimer = setTimeout(async () => {
      console.log('🔄 执行重连...')
      try {
        // 只重新连接信令服务器，不重新初始化
        if (this.isOnline) {
          await this.connectToSignalingServer()
          console.log('✅ 信令服务器重连成功')
          this.reconnectAttempts = 0
        }
      } catch (error) {
        console.error('❌ 重连失败:', error)
        this.scheduleReconnect()
      }
    }, delay)
  }

  private handleNetworkOnline(): void {
    console.log('🌐 网络恢复')
    this.isOnline = true
    this.syncStore.setNetworkStatus(true)

    // 网络恢复后立即尝试同步离线操作
    setTimeout(() => {
      this.syncOfflineOperations()
    }, 1000)

    // 重新连接信令服务器
    this.initialize().catch(console.error)
  }

  /**
   * 同步离线期间的操作
   */
  private async syncOfflineOperations(): Promise<void> {
    if (!this.isOnline) {
      console.log('⏸️ 网络未连接，暂缓同步离线操作')
      return
    }

    try {
      console.log('🔄 开始同步离线期间的操作...')

      // 获取所有待同步的操作
      const pendingOperations = await this.getSyncFramework().getPendingSyncOperations()

      if (pendingOperations.length === 0) {
        console.log('✅ 没有待同步的离线操作')
        return
      }

      console.log(`📦 发现 ${pendingOperations.length} 个待同步的离线操作`)

      // 分批发送操作
      await this.sendOperationsBatch(pendingOperations)

      console.log('✅ 离线操作同步完成')
    } catch (error) {
      console.error('❌ 同步离线操作失败:', error)
    }
  }

  /**
   * 分批发送操作
   */
  private async sendOperationsBatch(operations: any[]): Promise<void> {
    const connectedPeers = Array.from(this.dataChannels.keys())

    if (connectedPeers.length === 0) {
      console.log('⏳ 没有已连接的对等节点，等待连接...')
      return
    }

    // 按批次发送
    for (let i = 0; i < operations.length; i += this.BATCH_SIZE) {
      const batch = operations.slice(i, i + this.BATCH_SIZE)
      const batchIndex = Math.floor(i / this.BATCH_SIZE)
      const totalBatches = Math.ceil(operations.length / this.BATCH_SIZE)

      console.log(`📤 发送批次 ${batchIndex + 1}/${totalBatches}, 操作数量: ${batch.length}`)

      // 发送到所有已连接的对等节点
      for (const peerId of connectedPeers) {
        await this.sendOperationsToPeer(peerId, batch, batchIndex, totalBatches)
      }

      // 小延迟避免网络拥塞
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  /**
   * 发送操作到指定对等节点
   */
  private async sendOperationsToPeer(
    peerId: string,
    operations: any[],
    batchIndex: number,
    totalBatches: number,
  ): Promise<void> {
    try {
      const success = this.sendDataToPeer(peerId, {
        type: 'sync-operations-batch',
        operations: operations,
        batch_index: batchIndex,
        total_batches: totalBatches,
        is_offline_sync: true, // 标记为离线同步
      })

      if (success) {
        console.log(`✅ 成功发送批次 ${batchIndex + 1} 到 ${peerId}`)

        // 如果这是最后一个批次，标记操作为已同步
        if (batchIndex === totalBatches - 1) {
          const operationIds = operations.map((op) => op.id)
          await this.getSyncFramework().markOperationsAsSynced(operationIds)
        }
      } else {
        console.warn(`⚠️ 发送批次 ${batchIndex + 1} 到 ${peerId} 失败`)
        this.retryOperations(operations, peerId)
      }
    } catch (error) {
      console.error(`❌ 发送操作到 ${peerId} 失败:`, error)
      this.retryOperations(operations, peerId)
    }
  }

  /**
   * 重试失败的操作
   */
  private retryOperations(operations: any[], peerId: string): void {
    for (const operation of operations) {
      const attempt = this.syncRetryAttempts.get(operation.id) || 0

      if (attempt < this.MAX_RETRY_ATTEMPTS) {
        this.syncRetryAttempts.set(operation.id, attempt + 1)
        console.log(
          `🔄 计划重试操作 ${operation.id} (尝试 ${attempt + 1}/${this.MAX_RETRY_ATTEMPTS})`,
        )

        // 3秒后重试
        setTimeout(() => {
          if (this.dataChannels.has(peerId)) {
            this.sendDataToPeer(peerId, {
              type: 'sync-operation',
              operation: operation,
              is_retry: true,
            })
          }
        }, 3000)
      } else {
        console.error(`❌ 操作 ${operation.id} 达到最大重试次数，停止重试`)
        this.syncRetryAttempts.delete(operation.id)
      }
    }
  }

  private handleNetworkOffline(): void {
    console.log('🌐 网络断开')
    this.isOnline = false
    this.syncStore.setNetworkStatus(false)
    this.syncStore.setConnectionStatus('disconnected')
  }

  private cleanupPeerConnections(): void {
    this.peerConnections.forEach((peerConn) => {
      this.closePeerConnection(peerConn.peerId)
    })
  }

  private generateClientId(): string {
    // 生成或从本地存储获取客户端ID
    let clientId = localStorage.getItem('p2p-client-id')
    if (!clientId) {
      clientId = uuidv4()
      localStorage.setItem('p2p-client-id', clientId)
    }
    return clientId
  }

  // 公共方法
  getConnectionStats(): any {
    const connectedPeers = Array.from(this.peerConnections.values()).filter(
      (peer) => peer.isConnected,
    ).length

    return {
      clientId: this.clientId,
      connectedPeers,
      totalPeers: this.peerConnections.size,
      pendingOperations: this.pendingOperations.length,
      roomId: this.connectionConfig.roomId,
      syncFramework: this.getSyncFramework().getSyncStats(),
    }
  }

  debugConnections(): void {
    console.group('🔍 P2P连接调试')
    console.log('客户端ID:', this.clientId)
    console.log('房间ID:', this.connectionConfig.roomId)
    console.log('信令状态:', this.ws?.readyState)

    this.peerConnections.forEach((peerConn, peerId) => {
      console.group(`对等节点: ${peerId}`)
      console.log('连接状态:', peerConn.connection.connectionState)
      console.log('ICE状态:', peerConn.connection.iceConnectionState)
      console.log('数据通道:', peerConn.dataChannel?.readyState)
      console.log('是否连接:', peerConn.isConnected)
      console.log('连接角色:', peerConn.role)
      console.groupEnd()
    })
    console.groupEnd()
  }

  // 添加一个测试方法来验证数据通道
  async testDataChannel(peerId: string): Promise<void> {
    const peerConn = this.peerConnections.get(peerId)
    if (!peerConn || !peerConn.isConnected) {
      console.error(`❌ 无法测试数据通道: ${peerId} 未连接`)
      return
    }

    const testMessage = {
      type: 'test',
      message: 'Hello from ' + this.clientId,
      timestamp: Date.now(),
    }

    console.log(`🧪 发送测试消息到 ${peerId}:`, testMessage)
    this.sendDataToPeer(peerId, testMessage)
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.cleanupPeerConnections()
    this.syncStore.setConnectionStatus('disconnected')
  }
}
