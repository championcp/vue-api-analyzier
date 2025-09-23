const os = require('os');
const fs = require('fs');

/**
 * Windows中文支持工具类
 * 解决Windows下的中文乱码问题
 */
class WindowsChineseSupport {
  constructor() {
    this.isWindows = os.platform() === 'win32';
    this.init();
  }

  /**
   * 初始化Windows中文支持
   */
  init() {
    if (this.isWindows) {
      // 设置控制台编码为UTF-8（Windows 10+支持）
      try {
        // 设置代码页为UTF-8
        if (process.env.NODE_ENV !== 'test') {
          const { execSync } = require('child_process');
          execSync('chcp 65001', { stdio: 'ignore' });
        }
      } catch (error) {
        // 静默忽略错误，可能是权限问题
      }

      // 设置Node.js控制台输出编码
      if (process.stdout && process.stdout.setEncoding) {
        process.stdout.setEncoding('utf8');
      }
      if (process.stderr && process.stderr.setEncoding) {
        process.stderr.setEncoding('utf8');
      }
    }
  }

  /**
   * 安全的控制台输出（处理Windows中文显示）
   * @param {string} message 要输出的消息
   * @param {string} type 输出类型：'log', 'warn', 'error'
   */
  safeConsoleOutput(message, type = 'log') {
    if (this.isWindows) {
      // Windows下确保消息正确编码
      const encodedMessage = this.ensureUTF8(message);
      
      switch (type) {
        case 'warn':
          console.warn(encodedMessage);
          break;
        case 'error':
          console.error(encodedMessage);
          break;
        default:
          console.log(encodedMessage);
      }
    } else {
      // 非Windows系统直接输出
      switch (type) {
        case 'warn':
          console.warn(message);
          break;
        case 'error':
          console.error(message);
          break;
        default:
          console.log(message);
      }
    }
  }

  /**
   * 确保字符串为UTF-8编码
   * @param {string} str 输入字符串
   * @returns {string} UTF-8编码的字符串
   */
  ensureUTF8(str) {
    if (typeof str !== 'string') {
      return str;
    }

    try {
      // 检查是否已经是正确的UTF-8
      const buffer = Buffer.from(str, 'utf8');
      return buffer.toString('utf8');
    } catch (error) {
      // 如果转换失败，返回原字符串
      return str;
    }
  }

  /**
   * 写入CSV文件（Windows兼容）
   * @param {string} filePath 文件路径
   * @param {string} content CSV内容
   * @param {Object} options 选项
   */
  writeCSVFile(filePath, content, options = {}) {
    const {
      addBOM = true,      // 是否添加BOM（Excel兼容）
      encoding = 'utf8'   // 文件编码
    } = options;

    let finalContent = content;

    if (this.isWindows && addBOM) {
      // 添加UTF-8 BOM，让Excel正确识别中文
      const BOM = '\uFEFF';
      finalContent = BOM + content;
    }

    // 确保目录存在
    const dirPath = require('path').dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // 写入文件
    fs.writeFileSync(filePath, finalContent, encoding);
  }

  /**
   * 读取文件（Windows编码兼容）
   * @param {string} filePath 文件路径
   * @param {string} encoding 编码格式
   * @returns {string} 文件内容
   */
  readFile(filePath, encoding = 'utf8') {
    try {
      const content = fs.readFileSync(filePath, encoding);
      return this.ensureUTF8(content);
    } catch (error) {
      if (this.isWindows && encoding === 'utf8') {
        // Windows下尝试GBK编码
        try {
          const iconv = require('iconv-lite');
          const buffer = fs.readFileSync(filePath);
          return iconv.decode(buffer, 'gbk');
        } catch (gbkError) {
          // 如果iconv-lite不可用或解码失败，抛出原错误
          throw error;
        }
      }
      throw error;
    }
  }

  /**
   * 获取Windows兼容的命令行提示
   * @returns {Array<string>} 提示信息数组
   */
  getWindowsUsageTips() {
    if (!this.isWindows) {
      return [];
    }

    return [
      '',
      '=== Windows中文支持提示 ===',
      '1. 如果控制台显示乱码，请尝试以下方法：',
      '   - 在命令行执行: chcp 65001',
      '   - 或使用PowerShell替代cmd',
      '   - 或使用Windows Terminal',
      '',
      '2. 如果CSV文件在Excel中显示乱码：',
      '   - 文件已自动添加UTF-8 BOM标记',
      '   - 使用Excel "导入数据" 功能打开CSV',
      '   - 或使用WPS Office等支持UTF-8的软件',
      '',
      '3. 推荐使用环境：',
      '   - Windows Terminal + PowerShell',
      '   - VS Code集成终端',
      '   - Git Bash',
      ''
    ];
  }

  /**
   * 检测当前控制台是否支持UTF-8
   * @returns {boolean} 是否支持UTF-8
   */
  isConsoleUTF8Ready() {
    if (!this.isWindows) {
      return true;
    }

    try {
      // 测试输出中文字符
      const testChar = '测';
      const encoded = Buffer.from(testChar, 'utf8').toString('utf8');
      return encoded === testChar;
    } catch (error) {
      return false;
    }
  }

  /**
   * 显示编码状态信息
   */
  showEncodingStatus() {
    if (!this.isWindows) {
      return;
    }

    const utf8Ready = this.isConsoleUTF8Ready();
    
    this.safeConsoleOutput('=== Windows编码状态 ===');
    this.safeConsoleOutput(`平台: ${os.platform()} ${os.release()}`);
    this.safeConsoleOutput(`控制台UTF-8支持: ${utf8Ready ? '✓ 支持' : '✗ 不支持'}`);
    this.safeConsoleOutput(`Node.js版本: ${process.version}`);
    
    if (!utf8Ready) {
      this.safeConsoleOutput('', 'warn');
      this.safeConsoleOutput('⚠️ 检测到控制台可能不支持UTF-8显示', 'warn');
      this.safeConsoleOutput('建议运行: chcp 65001', 'warn');
    }
    this.safeConsoleOutput('');
  }
}

module.exports = WindowsChineseSupport;