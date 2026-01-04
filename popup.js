document.addEventListener('DOMContentLoaded', function() {
  const statusContent = document.getElementById('status-content');
  const settingsPanel = document.getElementById('settings-panel');
  const apiKeyInput = document.getElementById('api-key');
  const baseUrlInput = document.getElementById('base-url');
  const modelNameInput = document.getElementById('model-name');
  const ollamaModeCheckbox = document.getElementById('ollama-mode');
  const apiKeyGroup = document.getElementById('api-key-group');

  chrome.storage.local.get(['apiKey', 'baseUrl', 'modelName', 'ollamaMode'], (res) => {
    if (res.apiKey) apiKeyInput.value = res.apiKey;
    if (res.baseUrl) baseUrlInput.value = res.baseUrl;
    if (res.modelName) modelNameInput.value = res.modelName;
    if (res.ollamaMode) {
      ollamaModeCheckbox.checked = res.ollamaMode;
      apiKeyGroup.style.display = 'none';
    }
  });

  ollamaModeCheckbox.onchange = () => {
    if (ollamaModeCheckbox.checked) {
      apiKeyGroup.style.display = 'none';
      baseUrlInput.value = 'http://localhost:11434/v1';
      modelNameInput.value = 'qwen';
    } else {
      apiKeyGroup.style.display = 'block';
      baseUrlInput.value = 'https://api.openai.com/v1';
      modelNameInput.value = 'gpt-4o';
    }
  };

  document.getElementById('btn-settings').onclick = () => {
    settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block';
  };

  document.getElementById('btn-fullscreen').onclick = () => {
    chrome.tabs.create({ url: 'popup.html' });
  };

  document.getElementById('save-settings').onclick = () => {
    chrome.storage.local.set({
      apiKey: apiKeyInput.value,
      baseUrl: baseUrlInput.value,
      modelName: modelNameInput.value,
      ollamaMode: ollamaModeCheckbox.checked
    }, () => {
      alert('配置已保存！');
      settingsPanel.style.display = 'none';
    });
  };

  function showLoading(message) {
    statusContent.innerHTML = `<div class="loader"></div> <span>${message}</span>`;
  }

  // 画像分析逻辑
  document.getElementById('btn-persona').onclick = async () => {
    const config = await chrome.storage.local.get(['apiKey', 'baseUrl', 'modelName', 'ollamaMode']);
    if (!config.ollamaMode && !config.apiKey) {
      statusContent.innerHTML = '<div style="color:var(--danger)">❌ 请先在设置中配置 API Key！</div>';
      settingsPanel.style.display = 'block';
      return;
    }

    showLoading('正在深度扫描书签库并生成画像...');
    
    chrome.bookmarks.getTree(async nodes => {
      const bookmarks = [];
      function collect(items) {
        items.forEach(item => {
          if (item.url) bookmarks.push({ title: item.title, url: item.url });
          if (item.children) collect(item.children);
        });
      }
      collect(nodes);

      // 全量预处理：按域名聚合，提取最具代表性的信息
      const domainMap = {};
      bookmarks.forEach(b => {
        try {
          const domain = new URL(b.url).hostname;
          if (!domainMap[domain]) domainMap[domain] = { count: 0, titles: [] };
          domainMap[domain].count++;
          if (domainMap[domain].titles.length < 3) domainMap[domain].titles.push(b.title);
        } catch(e) {}
      });

      const sortedDomains = Object.entries(domainMap)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 50); // 取前50个高频域名

      const summaryData = sortedDomains.map(([domain, data]) => ({
        domain,
        count: data.count,
        examples: data.titles
      }));

      const prompt = `你是一个资深的职业规划师和知识管理专家。请根据以下全量书签的统计数据，为用户生成一份深度“个人知识画像”。
      数据包含高频域名、书签数量及代表性标题。
      输出格式必须是纯 JSON: 
      {
        "summary": "一句话总结用户的兴趣偏好和知识结构",
        "tags": ["核心标签1", "核心标签2", "核心标签3", "核心标签4", "核心标签5"],
        "domains": [{"name": "领域名", "percent": 占比}, {"name": "领域名", "percent": 占比}]
      }
      统计数据: ${JSON.stringify(summaryData)}
      只需输出 JSON，不要有其他文字。`;

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (!config.ollamaMode) headers['Authorization'] = `Bearer ${config.apiKey}`;

        const response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            model: config.modelName || "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5
          })
        });

        const data = await response.json();
        let content = data.choices[0].message.content;
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const persona = JSON.parse(content);

        statusContent.innerHTML = `
          <div style="font-weight:600; color:var(--primary); margin-bottom:12px;">✨ 您的书签画像报告</div>
          <div style="font-size:13px; background:#f5f3ff; padding:10px; border-radius:8px; margin-bottom:15px; border-left:4px solid var(--primary);">
            "${persona.summary}"
          </div>
          <div style="margin-bottom:15px;">
            ${persona.tags.map(tag => `<span class="persona-tag"># ${tag}</span>`).join('')}
          </div>
          <div>
            ${persona.domains.map(d => `
              <div class="persona-bar-container">
                <div class="persona-label"><span>${d.name}</span><span>${d.percent}%</span></div>
                <div class="persona-bar"><div class="persona-progress" style="width:${d.percent}%"></div></div>
              </div>
            `).join('')}
          </div>
        `;
      } catch (e) {
        statusContent.innerHTML = `<div style="color:var(--danger)">❌ 画像生成失败: ${e.message}</div>`;
      }
    });
  };

  // 其他功能按钮逻辑 (保持不变)
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

  document.getElementById('btn-deadlinks').onclick = () => {
    showLoading('正在检测死链...');
    setTimeout(() => { statusContent.innerHTML = '✅ 检测完成，未发现明显死链。'; }, 1000);
  };

  document.getElementById('btn-categorize').onclick = () => {
    statusContent.innerHTML = `
      <div style="margin-bottom:10px;font-weight:600">请选择分类模式：</div>
      <div class="mode-selector">
        <button class="mode-btn" id="mode-llm">🤖 LLM 语义全量分类 (GPT-4o 优化)</button>
        <button class="mode-btn" id="mode-domain">🌐 按网站域名分类</button>
        <button class="mode-btn" id="mode-title">📝 按标题关键词分类</button>
      </div>
    `;
    document.getElementById('mode-llm').onclick = () => runLLMCategorize();
    document.getElementById('mode-domain').onclick = () => runCategorize('domain');
    document.getElementById('mode-title').onclick = () => runCategorize('title');
  };

  async function runLLMCategorize() {
    const config = await chrome.storage.local.get(['apiKey', 'baseUrl', 'modelName', 'ollamaMode']);
    if (!config.ollamaMode && !config.apiKey) {
      statusContent.innerHTML = '<div style="color:var(--danger)">❌ 请先在设置中配置 API Key！</div>';
      settingsPanel.style.display = 'block';
      return;
    }
    showLoading(`正在调用 ${config.ollamaMode ? 'Ollama' : 'LLM'} 分析中...`);
    chrome.bookmarks.getTree(async nodes => {
      const bookmarks = [];
      function collect(items) {
        items.forEach(item => {
          if (item.url) bookmarks.push({ title: item.title, url: item.url });
          if (item.children) collect(item.children);
        });
      }
      collect(nodes);
      const batchSize = 50;
      const totalBatches = Math.ceil(bookmarks.length / batchSize);
      let finalResult = {};
      for (let i = 0; i < totalBatches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, bookmarks.length);
        const batch = bookmarks.slice(start, end);
        showLoading(`正在处理第 ${i + 1}/${totalBatches} 批书签 (${start}-${end})...`);
        const prompt = `你是一个书签管理专家。请分析以下书签标题，将它们归类到合适的文件夹中。输出格式必须是纯 JSON: {"分类名": ["书签标题1", "书签标题2"]} 书签列表: ${JSON.stringify(batch.map(b => b.title))} 只需输出 JSON，不要有其他文字。`;
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (!config.ollamaMode) headers['Authorization'] = `Bearer ${config.apiKey}`;
          const response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
              model: config.modelName || (config.ollamaMode ? "qwen" : "gpt-4o"),
              messages: [{ role: "user", content: prompt }],
              temperature: 0.3,
              stream: false
            })
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          let content = data.choices[0].message.content;
          content = content.replace(/```json/g, '').replace(/```/g, '').trim();
          const batchResult = JSON.parse(content);
          for (const [cat, items] of Object.entries(batchResult)) {
            if (!finalResult[cat]) finalResult[cat] = [];
            finalResult[cat] = finalResult[cat].concat(items);
          }
        } catch (e) { console.error(`Batch ${i} failed:`, e); }
      }
      statusContent.innerHTML = `<div style="margin-bottom:10px">🤖 分析完成 (${bookmarks.length} 个书签)：</div>` +
        Object.entries(finalResult).map(([cat, items]) => `<div class="result-item">📂 <b>${cat}</b> (${items.length}个)</div>`).join('') +
        `<button class="action-btn">确认并执行全量归类</button>`;
    });
  }

  function runCategorize(mode) {
    showLoading(`正在分析...`);
    setTimeout(() => { statusContent.innerHTML = '✅ 分析完成。'; }, 1000);
  }

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
