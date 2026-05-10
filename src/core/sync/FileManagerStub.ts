export class FileManagerStub {
  private static instance: FileManagerStub;

  static getInstance(): FileManagerStub {
    if (!FileManagerStub.instance) {
      FileManagerStub.instance = new FileManagerStub();
    }
    return FileManagerStub.instance;
  }

  async checkFileContentExists(_fileId: string): Promise<boolean> {
    return false;
  }

  async requestFileContentSync(_fileId: string, _sourceClientId: string): Promise<void> {
    // 当前项目无文件同步，空操作
  }

  async downloadFile(_fileId: string): Promise<{ file: Blob; metadata: any }> {
    throw new Error('FileManagerStub: downloadFile not implemented');
  }

  async getFileMetadata(_fileId: string): Promise<any> {
    return null;
  }

  async storeFileInIndexedDB(_key: string, _file: File): Promise<void> {
    // 空操作
  }
}
