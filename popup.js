document.addEventListener('DOMContentLoaded', function() {
  const status = document.getElementById('status');

  // 1. 重复检测
  document.getElementById('btn-duplicates').onclick = () => {
    status.innerHTML = '正在扫描重复书签...';
    chrome.bookmarks.getTree(nodes => {
      const urls = {};
      const duplicates = [];
      function findDupes(items) {
        items.forEach(item => {
          if (item.url) {
            if (urls[item.url]) {
              duplicates.push(item);
            } else {
              urls[item.url] = true;
            }
          }
          if (item.children) findDupes(item.children);
        });
      }
      findDupes(nodes);
      if (duplicates.length > 0) {
        status.innerHTML = `发现 ${duplicates.length} 个重复书签：<br>` + 
          duplicates.map(d => `<div class="result-item">${d.title}</div>`).join('') +
          `<button id="clean-dupes" style="margin-top:10px; width:100%">一键清理</button>`;
        document.getElementById('clean-dupes').onclick = () => {
          duplicates.forEach(d => chrome.bookmarks.remove(d.id));
          status.innerHTML = '清理完成！';
        };
      } else {
        status.innerHTML = '未发现重复书签。';
      }
    });
  };

  // 2. 死链检测
  document.getElementById('btn-deadlinks').onclick = async () => {
    status.innerHTML = '正在检测死链（可能需要较长时间）...';
    chrome.bookmarks.getTree(async nodes => {
      const allLinks = [];
      function collectLinks(items) {
        items.forEach(item => {
          if (item.url && item.url.startsWith('http')) allLinks.push(item);
          if (item.children) collectLinks(item.children);
        });
      }
      collectLinks(nodes);
      
      let deadCount = 0;
      let checked = 0;
      const deadLinks = [];

      for (const link of allLinks) {
        try {
          const res = await fetch(link.url, { method: 'HEAD', mode: 'no-cors' });
          // 注意：由于跨域限制，HEAD 请求可能无法获取准确状态码，这里仅作演示逻辑
          // 实际插件中通常需要 background script 配合或使用更复杂的检测机制
        } catch (e) {
          deadLinks.push(link);
          deadCount++;
        }
        checked++;
        status.innerHTML = `正在检测: ${checked}/${allLinks.length}...`;
      }
      
      status.innerHTML = `检测完成！发现 ${deadLinks.length} 个疑似失效链接。`;
    });
  };

  // 3. 自动分类
  document.getElementById('btn-categorize').onclick = () => {
    status.innerHTML = '正在根据关键词自动分类...';
    const rules = [
      { kw: ['github', 'code', 'git'], folder: '编程开发' },
      { kw: ['ai', 'gpt', 'llm'], folder: '人工智能' },
      { kw: ['news', 'weibo', 'zhihu'], folder: '社交资讯' }
    ];

    chrome.bookmarks.getTree(nodes => {
      // 简化逻辑：仅演示如何移动书签
      status.innerHTML = '分类逻辑已运行。在实际应用中，这将创建文件夹并移动匹配的书签。';
    });
  };

  // 4. 访问统计
  document.getElementById('btn-stats').onclick = () => {
    chrome.storage.local.get(['visitStats'], (result) => {
      const stats = result.visitStats || {};
      const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 5);
      
      if (sorted.length > 0) {
        status.innerHTML = '<strong>访问量最多的网站：</strong><ul class="stats-list">' +
          sorted.map(([url, count]) => `<li><span class="title">${url.substring(0,30)}...</span> <b>${count}次</b></li>`).join('') +
          '</ul>';
      } else {
        status.innerHTML = '暂无统计数据，请先浏览网页。';
      }
    });
  };
});
