// lib/i18n.js
// Internationalization support for Chinese and English

export const translations = {
  zh: {
    // Header
    'app.title': 'Beta',
    'app.subtitle': '你的AI学习与创业伙伴',

    // Auth
    'auth.login': '登录',
    'auth.signup': '注册',
    'auth.email': '邮箱',
    'auth.password': '密码',
    'auth.confirmPassword': '确认密码',
    'auth.loginToBeta': '登录到 Beta',
    'auth.logout': '登出',
    'auth.loginSuccess': '登录成功',
    'auth.signupSuccess': '注册成功',
    'auth.loginFailed': '登录失败',
    'auth.signupFailed': '注册失败',

    // Sidebar
    'sidebar.newChat': 'New Chat',
    'sidebar.search': 'Search conversations...',
    'sidebar.recents': 'Recents',
    'sidebar.online': 'Online',

    // Modes
    'mode.learning': '学习模式',
    'mode.startup': '创业导师',
    'mode.agent': '创建Agent',

    // Welcome screen
    'welcome.title': 'Beta',
    'welcome.subtitle': '你的AI学习与创业伙伴',
    'welcome.tip': '提示',
    'welcome.tipText': '选择一个示例开始，或在下方输入你的问题',

    'welcome.learningTitle': '📚 学习模式',
    'welcome.startupTitle': '🚀 创业导师',
    'welcome.agentTitle': '🎯 创建Agent',

    // Prompts
    'prompt.quantum': '量子计算入门',
    'prompt.blockchain': '区块链技术框架',
    'prompt.neuralNet': '神经网络原理',
    'prompt.saas': 'SaaS定价策略',
    'prompt.fundraising': '融资展示建议',
    'prompt.team': '团队组建策略',
    'prompt.feedback': '用户反馈分析助手',
    'prompt.interviewer': '技术面试官',
    'prompt.writing': '技术写作助手',

    // Chat
    'chat.you': 'You',
    'chat.placeholder': 'Enter a question here...',
    'chat.send': 'Send',
    'chat.stop': 'Stop generating',
    'chat.uploadFile': 'Upload file',

    // Messages
    'msg.deleteConfirm': '确定要删除这个会话吗？',
    'msg.deleteFailed': '删除失败',
    'msg.loadFailed': '加载会话失败',
    'msg.searchFailed': '搜索请求失败',

    // Search
    'search.clearSearch': '✕ 清除搜索',
    'search.noResults': '没有找到匹配的对话',
    'search.matches': '条匹配',

    // Files
    'files.selected': 'Selected files:',
    'files.clear': 'Clear',

    // Reactions
    'reaction.helpful': 'Helpful',
    'reaction.notHelpful': 'Not helpful',
    'reaction.bookmark': 'Bookmark',

    // Share
    'share.title': '分享对话',
    'share.download': 'Download Report',
    'share.copy': 'Copy to Clipboard',
    'share.close': 'Close',
  },

  en: {
    // Header
    'app.title': 'Beta',
    'app.subtitle': 'Your AI Learning & Startup Partner',

    // Auth
    'auth.login': 'Login',
    'auth.signup': 'Sign Up',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.confirmPassword': 'Confirm Password',
    'auth.loginToBeta': 'Login to Beta',
    'auth.logout': 'Logout',
    'auth.loginSuccess': 'Login successful',
    'auth.signupSuccess': 'Sign up successful',
    'auth.loginFailed': 'Login failed',
    'auth.signupFailed': 'Sign up failed',

    // Sidebar
    'sidebar.newChat': 'New Chat',
    'sidebar.search': 'Search conversations...',
    'sidebar.recents': 'Recents',
    'sidebar.online': 'Online',

    // Modes
    'mode.learning': 'Learning Mode',
    'mode.startup': 'Startup Mentor',
    'mode.agent': 'Create Agent',

    // Welcome screen
    'welcome.title': 'Beta',
    'welcome.subtitle': 'Your AI Learning & Startup Partner',
    'welcome.tip': 'Tip',
    'welcome.tipText': 'Choose an example to get started, or type your question below',

    'welcome.learningTitle': '📚 Learning Mode',
    'welcome.startupTitle': '🚀 Startup Mentor',
    'welcome.agentTitle': '🎯 Create Agent',

    // Prompts
    'prompt.quantum': 'Intro to Quantum Computing',
    'prompt.blockchain': 'Blockchain Framework',
    'prompt.neuralNet': 'Neural Networks',
    'prompt.saas': 'SaaS Pricing Strategy',
    'prompt.fundraising': 'Fundraising Pitch Tips',
    'prompt.team': 'Team Building Strategy',
    'prompt.feedback': 'User Feedback Analyzer',
    'prompt.interviewer': 'Tech Interviewer',
    'prompt.writing': 'Tech Writing Assistant',

    // Chat
    'chat.you': 'You',
    'chat.placeholder': 'Enter a question here...',
    'chat.send': 'Send',
    'chat.stop': 'Stop generating',
    'chat.uploadFile': 'Upload file',

    // Messages
    'msg.deleteConfirm': 'Are you sure you want to delete this conversation?',
    'msg.deleteFailed': 'Delete failed',
    'msg.loadFailed': 'Failed to load conversation',
    'msg.searchFailed': 'Search request failed',

    // Search
    'search.clearSearch': '✕ Clear search',
    'search.noResults': 'No matching conversations found',
    'search.matches': 'matches',

    // Files
    'files.selected': 'Selected files:',
    'files.clear': 'Clear',

    // Reactions
    'reaction.helpful': 'Helpful',
    'reaction.notHelpful': 'Not helpful',
    'reaction.bookmark': 'Bookmark',

    // Share
    'share.title': 'Share Conversation',
    'share.download': 'Download Report',
    'share.copy': 'Copy to Clipboard',
    'share.close': 'Close',
  }
};

class I18n {
  constructor() {
    this.currentLang = this.detectLanguage();
    this.listeners = [];
  }

  detectLanguage() {
    // Check localStorage first
    const saved = localStorage.getItem('app_language');
    if (saved && (saved === 'zh' || saved === 'en')) {
      return saved;
    }

    // Auto-detect from browser
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('zh')) {
      return 'zh';
    }
    return 'en';
  }

  setLanguage(lang) {
    if (lang !== 'zh' && lang !== 'en') {
      console.warn('Invalid language:', lang);
      return;
    }

    this.currentLang = lang;
    localStorage.setItem('app_language', lang);

    // Notify all listeners
    this.listeners.forEach(callback => callback(lang));
  }

  getLanguage() {
    return this.currentLang;
  }

  t(key) {
    return translations[this.currentLang][key] || key;
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  offChange(callback) {
    this.listeners = this.listeners.filter(cb => cb !== callback);
  }
}

// Export singleton instance
export const i18n = new I18n();
