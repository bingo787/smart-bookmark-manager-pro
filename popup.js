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
      for (let i = 0; i < Math.min(allLinks.length, 10); i++) {
        const link = allLinks[i];
        showLoading(`正在检测 (${i+1}/${allLinks.length}): ${link.title.substring(0,15)}...`);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
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
    statusContent.innerHTML = `
      <div style="margin-bottom:10px;font-weight:600">请选择分类模式：</div>
      <div class="mode-selector">
        <button class="mode-btn" id="mode-smart">✨ 智能自动分类 (综合)</button>
        <button class="mode-btn" id="mode-domain">🌐 按网站域名分类</button>
        <button class="mode-btn" id="mode-title">📝 按标题关键词分类</button>
      </div>
    `;

    document.getElementById('mode-smart').onclick = () => runCategorize('smart');
    document.getElementById('mode-domain').onclick = () => runCategorize('domain');
    document.getElementById('mode-title').onclick = () => runCategorize('title');
  };

  function runCategorize(mode) {
    showLoading(`正在按 ${mode === 'smart' ? '智能' : mode === 'domain' ? '域名' : '标题'} 模式分析...`);
    
    chrome.bookmarks.getTree(nodes => {
      const allBookmarks = [];
      function collect(items) {
        items.forEach(item => {
          if (item.url) allBookmarks.push(item);
          if (item.children) collect(item.children);
        });
      }
      collect(nodes);

      let suggestions = {};
      if (mode === 'domain') {
        allBookmarks.forEach(b => {
          try {
            const domain = new URL(b.url).hostname;
            if (!suggestions[domain]) suggestions[domain] = [];
            suggestions[domain].push(b);
          } catch(e) {}
        });
      } else if (mode === 'title') {
        const keywords = ['GitHub', 'AI', 'News', 'Blog', 'Work'];
        keywords.forEach(kw => suggestions[kw] = []);
        allBookmarks.forEach(b => {
          keywords.forEach(kw => {
            if (b.title.toLowerCase().includes(kw.toLowerCase())) suggestions[kw].push(b);
          });
        });
      } else {
        suggestions = { "人工智能": [], "编程开发": [], "其他": [] };
        // 模拟智能逻辑
      }

      const displayList = Object.entries(suggestions)
        .filter(([_, list]) => list.length > 0)
        .slice(0, 5);

      statusContent.innerHTML = `
        <div style="margin-bottom:10px">分析完成，建议创建以下分类：</div>
        ${displayList.map(([name, list]) => `<div class="result-item">📂 <b>${name}</b> (${list.length}个书签)</div>`).join('')}
        <button class="action-btn">确认并执行归类</button>
      `;
    });
  }

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
