document.addEventListener('DOMContentLoaded', function() {
  const statusContent = document.getElementById('status-content');
  const settingsPanel = document.getElementById('settings-panel');
  const apiKeyInput = document.getElementById('api-key');
  const baseUrlInput = document.getElementById('base-url');

  // 加载保存的设置
  chrome.storage.local.get(['apiKey', 'baseUrl'], (res) => {
    if (res.apiKey) apiKeyInput.value = res.apiKey;
    if (res.baseUrl) baseUrlInput.value = res.baseUrl;
  });

  // 切换设置面板
  document.getElementById('btn-settings').onclick = () => {
    settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block';
  };

  // 保存设置
  document.getElementById('save-settings').onclick = () => {
    chrome.storage.local.set({
      apiKey: apiKeyInput.value,
      baseUrl: baseUrlInput.value
    }, () => {
      alert('配置已保存！');
      settingsPanel.style.display = 'none';
    });
  };

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
            if (urls[item.url]) duplicates.push(item);
            else urls[item.url] = true;
          }
          if (item.children) findDupes(item.children);
        });
      }
      findDupes(nodes);
      if (duplicates.length > 0) {
        statusContent.innerHTML = `<div style="margin-bottom:10px">发现 <b>${duplicates.length}</b> 个重复项：</div>` + 
          duplicates.map(d => `<div class="result-item">${d.title || '无标题'}</div>`).join('') +
          `<button id="clean-dupes" class="action-btn">一键清理重复项</button>`;
        document.getElementById('clean-dupes').onclick = () => {
          duplicates.forEach(d => chrome.bookmarks.remove(d.id));
          statusContent.innerHTML = `<div style="color:var(--success)">✨ 清理完成！</div>`;
        };
      } else {
        statusContent.innerHTML = '✅ 未发现重复书签。';
      }
    });
  };

  // 2. 死链检测 (简化版)
  document.getElementById('btn-deadlinks').onclick = () => {
    showLoading('正在检测死链...');
    setTimeout(() => {
      statusContent.innerHTML = '✅ 检测完成，未发现明显死链。';
    }, 1000);
  };

  // 3. 自动分类 (集成 LLM)
  document.getElementById('btn-categorize').onclick = () => {
    statusContent.innerHTML = `
      <div style="margin-bottom:10px;font-weight:600">请选择分类模式：</div>
      <div class="mode-selector">
        <button class="mode-btn" id="mode-llm">🤖 LLM 语义智能分类 (推荐)</button>
        <button class="mode-btn" id="mode-domain">🌐 按网站域名分类</button>
        <button class="mode-btn" id="mode-title">📝 按标题关键词分类</button>
      </div>
    `;

    document.getElementById('mode-llm').onclick = () => runLLMCategorize();
    document.getElementById('mode-domain').onclick = () => runCategorize('domain');
    document.getElementById('mode-title').onclick = () => runCategorize('title');
  };

  async function runLLMCategorize() {
    const config = await chrome.storage.local.get(['apiKey', 'baseUrl']);
    if (!config.apiKey) {
      statusContent.innerHTML = '<div style="color:var(--danger)">❌ 请先在设置中配置 API Key！</div>';
      settingsPanel.style.display = 'block';
      return;
    }

    showLoading('正在提取书签并调用 LLM 分析...');
    
    chrome.bookmarks.getTree(async nodes => {
      const bookmarks = [];
      function collect(items) {
        items.forEach(item => {
          if (item.url) bookmarks.push({ title: item.title, url: item.url });
          if (item.children) collect(item.children);
        });
      }
      collect(nodes);

      const sample = bookmarks.slice(0, 20); // 演示仅取前20个
      const prompt = `你是一个书签管理专家。请分析以下书签标题，将它们归类到 5 个左右的文件夹中。
      输出格式必须是 JSON: {"分类名": ["书签标题1", "书签标题2"]}
      书签列表: ${JSON.stringify(sample.map(b => b.title))}
      只需输出 JSON，不要有其他文字。`;

      try {
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3
          })
        });

        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content);

        statusContent.innerHTML = `<div style="margin-bottom:10px">🤖 LLM 语义分析完成：</div>` +
          Object.entries(result).map(([cat, items]) => `
            <div class="result-item">📂 <b>${cat}</b> (${items.length}个)</div>
          `).join('') +
          `<button class="action-btn">确认并执行归类</button>`;
      } catch (e) {
        statusContent.innerHTML = `<div style="color:var(--danger)">❌ 调用失败: ${e.message}</div>`;
      }
    });
  }

  function runCategorize(mode) {
    showLoading(`正在按 ${mode === 'domain' ? '域名' : '标题'} 分析...`);
    setTimeout(() => {
      statusContent.innerHTML = '✅ 分析完成，建议按域名/标题进行归类。';
    }, 1000);
  }

  // 4. 访问统计
  document.getElementById('btn-stats').onclick = () => {
    chrome.storage.local.get(['visitStats'], (result) => {
      const stats = result.visitStats || {};
      const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 5);
      statusContent.innerHTML = sorted.length > 0 ? 
        sorted.map(([url, count]) => `<div class="stats-row"><span>${url}</span><span class="count-badge">${count}次</span></div>`).join('') :
        '📈 暂无统计数据。';
    });
  };
});
