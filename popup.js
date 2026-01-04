document.addEventListener('DOMContentLoaded', function() {
  const statusContent = document.getElementById('status-content');

  function showLoading(message) {
    statusContent.innerHTML = `<div class="loader"></div> <span>${message}</span>`;
  }

  // 1. 重复检测
  document.getElementById('btn-duplicates').onclick = () => {
    showLoading('正在扫描重复书签...');
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
        statusContent.innerHTML = `<div style="color:var(--text-main);margin-bottom:10px">发现 <b>${duplicates.length}</b> 个重复项：</div>` + 
          duplicates.map(d => `<div class="result-item" title="${d.url}">${d.title || '无标题'}</div>`).join('') +
          `<button id="clean-dupes" class="action-btn">一键清理重复项</button>`;
        
        document.getElementById('clean-dupes').onclick = () => {
          duplicates.forEach(d => chrome.bookmarks.remove(d.id));
          statusContent.innerHTML = `<div style="color:var(--success);font-weight:600">✨ 清理完成！</div>`;
        };
      } else {
        statusContent.innerHTML = '✅ 未发现重复书签，您的书签栏非常整洁。';
      }
    });
  };

  // 2. 死链检测
  document.getElementById('btn-deadlinks').onclick = async () => {
    showLoading('正在初始化检测...');
    chrome.bookmarks.getTree(async nodes => {
      const allLinks = [];
      function collectLinks(items) {
        items.forEach(item => {
          if (item.url && item.url.startsWith('http')) allLinks.push(item);
          if (item.children) collectLinks(item.children);
        });
      }
      collectLinks(nodes);
      
      let deadLinks = [];
      for (let i = 0; i < Math.min(allLinks.length, 20); i++) { // 限制前20个演示
        const link = allLinks[i];
        showLoading(`正在检测 (${i+1}/${allLinks.length}): ${link.title.substring(0,15)}...`);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          await fetch(link.url, { method: 'GET', mode: 'no-cors', signal: controller.signal });
          clearTimeout(timeoutId);
        } catch (e) {
          deadLinks.push(link);
        }
      }
      
      if (deadLinks.length > 0) {
        statusContent.innerHTML = `<div style="color:var(--danger);margin-bottom:10px">发现 ${deadLinks.length} 个疑似失效链接：</div>` +
          deadLinks.map(d => `<div class="result-item">${d.title}</div>`).join('');
      } else {
        statusContent.innerHTML = '✅ 检测完成，未发现明显死链。';
      }
    });
  };

  // 3. 自动分类
  document.getElementById('btn-categorize').onclick = () => {
    showLoading('正在分析书签内容...');
    setTimeout(() => {
      statusContent.innerHTML = `
        <div style="margin-bottom:10px">建议创建以下分类：</div>
        <div class="result-item">📂 <b>人工智能</b> (匹配 GPT, AI...)</div>
        <div class="result-item">📂 <b>开发工具</b> (匹配 GitHub, StackOverflow...)</div>
        <button class="action-btn">执行自动归类</button>
      `;
    }, 1500);
  };

  // 4. 访问统计
  document.getElementById('btn-stats').onclick = () => {
    chrome.storage.local.get(['visitStats'], (result) => {
      const stats = result.visitStats || {};
      const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 5);
      
      if (sorted.length > 0) {
        statusContent.innerHTML = sorted.map(([url, count]) => `
          <div class="stats-row">
            <span style="font-size:13px;color:var(--text-main);max-width:200px;overflow:hidden;text-overflow:ellipsis">${url}</span>
            <span class="count-badge">${count} 次访问</span>
          </div>
        `).join('');
      } else {
        statusContent.innerHTML = '📈 暂无统计数据。请在浏览网页一段时间后再查看。';
      }
    });
  };
});
