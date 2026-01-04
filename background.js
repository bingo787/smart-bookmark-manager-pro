// 监听标签页更新，统计访问量
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    const url = new URL(tab.url).hostname;
    
    chrome.storage.local.get(['visitStats'], (result) => {
      const stats = result.visitStats || {};
      stats[url] = (stats[url] || 0) + 1;
      chrome.storage.local.set({ visitStats: stats });
    });
  }
});

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('Smart Bookmark Manager Pro 已安装');
});
