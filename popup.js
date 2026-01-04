document.addEventListener('DOMContentLoaded', function() {
  const statusContent = document.getElementById('status-content');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  const settingsPanel = document.getElementById('settings-panel');

  // 加载配置
  chrome.storage.local.get(['apiKey', 'baseUrl', 'modelName', 'ollamaMode'], (res) => {
    if (res.apiKey) document.getElementById('api-key').value = res.apiKey;
    if (res.baseUrl) document.getElementById('base-url').value = res.baseUrl || 'https://api.openai.com/v1';
    if (res.modelName) document.getElementById('model-name').value = res.modelName || 'gpt-4o';
    if (res.ollamaMode) document.getElementById('ollama-mode').checked = res.ollamaMode;
  });

  // 保存配置
  document.getElementById('save-settings').onclick = () => {
    chrome.storage.local.set({
      apiKey: document.getElementById('api-key').value,
      baseUrl: document.getElementById('base-url').value,
      modelName: document.getElementById('model-name').value,
      ollamaMode: document.getElementById('ollama-mode').checked
    }, () => {
      alert('配置已保存！');
      settingsPanel.style.display = 'none';
    });
  };

  document.getElementById('btn-settings').onclick = () => {
    settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block';
  };

  document.getElementById('btn-fullscreen').onclick = () => {
    chrome.tabs.create({ url: 'popup.html' });
  };

  function addMessage(text, role) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerText = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function showLoading(msg) {
    statusContent.innerHTML = `<div class="loader"></div> <span>${msg}</span>`;
  }

  // AI 指令处理核心逻辑
  chatSend.onclick = async () => {
    const query = chatInput.value.trim();
    if (!query) return;

    addMessage(query, 'user');
    chatInput.value = '';
    
    const config = await chrome.storage.local.get(['apiKey', 'baseUrl', 'modelName', 'ollamaMode']);
    if (!config.apiKey && !config.ollamaMode) {
      addMessage('请先在设置中配置 API Key！', 'ai');
      return;
    }

    showLoading('AI 正在思考指令...');

    chrome.bookmarks.getTree(async nodes => {
      const bookmarks = [];
      function collect(items) {
        items.forEach(item => {
          if (item.url) bookmarks.push({ id: item.id, title: item.title, url: item.url });
          if (item.children) collect(item.children);
        });
      }
      collect(nodes);

      const prompt = `你是一个书签管理助手。请根据用户的指令，从以下操作中选择一个并返回 JSON 格式。
      操作类型: 
      - "DELETE": 删除书签 (需要提供匹配关键词)
      - "SEARCH": 搜索书签
      - "PERSONA": 画像分析
      - "DUPLICATE": 重复检测
      - "CHAT": 普通聊天
      
      用户指令: "${query}"
      
      返回格式: {"action": "操作类型", "keyword": "匹配词", "reply": "给用户的回复内容"}
      只需输出 JSON。`;

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (!config.ollamaMode) headers['Authorization'] = `Bearer ${config.apiKey}`;

        const response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            model: config.modelName || "gpt-4o",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3
          })
        });

        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim());

        handleAIAction(result, bookmarks);
      } catch (e) {
        addMessage(`抱歉，执行指令时出错了: ${e.message}`, 'ai');
        statusContent.innerHTML = '❌ 指令执行失败。';
      }
    });
  };

  function handleAIAction(result, bookmarks) {
    addMessage(result.reply, 'ai');
    statusContent.innerHTML = `✅ 已识别指令: ${result.action}`;
    
    if (result.action === 'DELETE' && result.keyword) {
      const toDelete = bookmarks.filter(b => 
        b.url.toLowerCase().includes(result.keyword.toLowerCase()) || 
        b.title.toLowerCase().includes(result.keyword.toLowerCase())
      );

      if (toDelete.length > 0) {
        statusContent.innerHTML = `
          <div style="color:var(--danger); font-weight:600;">⚠️ 确认删除 ${toDelete.length} 个书签？</div>
          <div style="font-size:11px; color:var(--text-muted); margin: 5px 0;">匹配关键词: "${result.keyword}"</div>
          <button id="confirm-ai-delete" class="action-btn" style="background:var(--danger)">确认执行删除</button>
        `;
        document.getElementById('confirm-ai-delete').onclick = () => {
          toDelete.forEach(b => chrome.bookmarks.remove(b.id));
          statusContent.innerHTML = '✨ 已成功清理相关书签。';
          addMessage(`已为您清理了 ${toDelete.length} 个匹配 "${result.keyword}" 的书签。`, 'ai');
        };
      } else {
        addMessage(`未找到匹配 "${result.keyword}" 的书签。`, 'ai');
      }
    } else if (result.action === 'DUPLICATE') {
      runDuplicateCheck();
    } else if (result.action === 'PERSONA') {
      runPersonaAnalysis();
    }
  }

  // 核心功能函数化
  function runDuplicateCheck() {
    showLoading('正在扫描重复项...');
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
          duplicates.slice(0, 5).map(d => `<div class="result-item">${d.title || '无标题'}</div>`).join('') +
          `<button id="clean-dupes" class="action-btn">一键清理重复项</button>`;
        document.getElementById('clean-dupes').onclick = () => {
          duplicates.forEach(d => chrome.bookmarks.remove(d.id));
          statusContent.innerHTML = '✅ 清理完成！';
        };
      } else {
        statusContent.innerHTML = '✅ 未发现重复书签。';
      }
    });
  }

  async function runPersonaAnalysis() {
    const config = await chrome.storage.local.get(['apiKey', 'baseUrl', 'modelName', 'ollamaMode']);
    showLoading('正在生成画像报告...');
    chrome.bookmarks.getTree(async nodes => {
      const bookmarks = [];
      function collect(items) {
        items.forEach(item => {
          if (item.url) bookmarks.push({ title: item.title, url: item.url });
          if (item.children) collect(item.children);
        });
      }
      collect(nodes);
      const sample = bookmarks.slice(0, 30);
      const prompt = `你是一个资深的知识管理专家。请根据以下书签标题生成 JSON 画像: {"summary": "总结", "tags": ["标签"], "domains": [{"name": "领域", "percent": 80}]} 书签: ${JSON.stringify(sample.map(b => b.title))}`;
      try {
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
          body: JSON.stringify({ model: config.modelName || "gpt-4o", messages: [{ role: "user", content: prompt }] })
        });
        const data = await response.json();
        const persona = JSON.parse(data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim());
        statusContent.innerHTML = `<div style="font-weight:600; color:var(--primary);">${persona.summary}</div>` + 
          persona.domains.map(d => `<div style="font-size:11px; margin-top:5px;">${d.name}: ${d.percent}%</div>`).join('');
      } catch (e) { statusContent.innerHTML = '❌ 画像生成失败。'; }
    });
  }

  // 绑定按钮
  document.getElementById('btn-duplicates').onclick = runDuplicateCheck;
  document.getElementById('btn-persona').onclick = runPersonaAnalysis;
  chatInput.onkeypress = (e) => { if (e.key === 'Enter') chatSend.click(); };
});
