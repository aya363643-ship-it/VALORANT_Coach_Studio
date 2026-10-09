// Twin Studio - Camera Director, Blinking Engine, Voice Toggle, Tabs & Antigravity File Analyzer

const cameraRig = document.getElementById('cameraRig');
const aiCard = document.getElementById('aiCard');
const hinanoCard = document.getElementById('hinanoCard');
const aiImg = document.getElementById('aiImg');
const hinanoImg = document.getElementById('hinanoImg');

const chatHistory = document.getElementById('chatHistory');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');

const aiIndicator = document.querySelector('.ai-indicator');
const hinanoIndicator = document.querySelector('.hinano-indicator');

// 音声・演出設定（localStorageから前回終了時の設定を即時復元）
const savedVoicePref = localStorage.getItem('isVoiceEnabled');
let isVoiceEnabled = (savedVoicePref !== null) ? (savedVoicePref === 'true') : true;

const savedMicPref = localStorage.getItem('isSpeechRecEnabled');
// スマホやWebブラウザで開くたびにマイクアクセス許可ダイアログが出るのを防ぐため、初期値はOFF（ユーザーがONにした時のみ保存＆有効化）
let isSpeechRecEnabled = (savedMicPref !== null) ? (savedMicPref === 'true') : false;

let isCameraZoomEnabled = true;
let isBlinkingEnabled = true;
let currentVolume = 0.9;
let aiSpeed = 1.05;
let hinanoSpeed = 1.15;
let mintVoice = "3c37646f-3881-5374-2a83-149267990abc:0";
let limeVoice = "292ea286-3d5f-f1cc-157c-66462a6a9d08:40";

// 会話送信の待機時間（秒：1.5〜10.0秒）
const savedDebouncePref = localStorage.getItem('voiceChatDebounceSec');
let voiceChatDebounceSec = (savedDebouncePref !== null) ? parseFloat(savedDebouncePref) : 3.0;


// 画像アセット
const ASSETS = {
  ai_normal: 'assets/ai.png',
  ai_blink: 'assets/ai_blink.png',
  hinano_normal: 'assets/hinano.png',
  hinano_blink: 'assets/hinano_blink.png'
};

// 1. 瞬き（パチパチ）ループ
let blinkAiTimer = null;
let blinkHinanoTimer = null;

function setupBlinking() {
  function blinkAi() {
    if (!isBlinkingEnabled) return;
    aiImg.src = ASSETS.ai_blink;
    setTimeout(() => {
      aiImg.src = ASSETS.ai_normal;
      const nextDelay = 3000 + Math.random() * 3500;
      blinkAiTimer = setTimeout(blinkAi, nextDelay);
    }, 140);
  }

  function blinkHinano() {
    if (!isBlinkingEnabled) return;
    hinanoImg.src = ASSETS.hinano_blink;
    setTimeout(() => {
      hinanoImg.src = ASSETS.hinano_normal;
      const nextDelay = 2500 + Math.random() * 3500;
      blinkHinanoTimer = setTimeout(blinkHinano, nextDelay);
    }, 150);
  }

  blinkAiTimer = setTimeout(blinkAi, 1800);
  blinkHinanoTimer = setTimeout(blinkHinano, 1000);
}
setupBlinking();

// 2. 音声合成 (COEIROINK 高音質AIボイス専用エンジン)
let currentPlayingAudio = null;
const audioPrefetchMap = new Map();

function stopCurrentSpeech() {
  if (currentPlayingAudio) {
    try {
      currentPlayingAudio.pause();
      currentPlayingAudio.currentTime = 0;
    } catch(e) {}
    currentPlayingAudio = null;
  }
}

let isCoeiroinkUnavailable = false;

// 起動時および定期的にCOEIROINKの利用可否を粘り強くチェックし、設定画面のインジケーターを更新
async function checkCoeiroinkStatus() {
  const dotEl = document.getElementById('coeiroinkStatusDot');
  const textEl = document.getElementById('coeiroinkStatusText');
  const btnEl = document.getElementById('btnLaunchCoeiroink');

  try {
    const res = await fetch('/api/tts_status');
    if (res.ok) {
      const data = await res.json();
      if (data.running) {
        isCoeiroinkUnavailable = false;
        if (dotEl) dotEl.style.background = '#22c55e'; // green
        if (textEl) textEl.innerHTML = '<span style="color:#4ade80;">🟢 音声エンジン（COEIROINK）稼働中</span>';
        if (btnEl) btnEl.style.display = 'none';
        return true;
      } else if (data.starting) {
        if (dotEl) dotEl.style.background = '#eab308'; // yellow
        if (textEl) textEl.innerHTML = '<span style="color:#fde047;">🟡 音声エンジン起動中... (モデル読込待機)</span>';
        if (btnEl) {
          btnEl.style.display = 'inline-block';
          btnEl.disabled = true;
          btnEl.textContent = '起動中...';
        }
      } else {
        isCoeiroinkUnavailable = false; // まだ完全無効化せず試行可能にする
        if (dotEl) dotEl.style.background = '#ef4444'; // red
        if (textEl) {
          if (data.foundPath) {
            textEl.innerHTML = '<span style="color:#f87171;">🔴 音声エンジン未起動（PC内に発見済み）</span>';
          } else {
            textEl.innerHTML = '<span style="color:#f87171;">🔴 音声エンジン停止中</span>';
          }
        }
        if (btnEl) {
          btnEl.style.display = 'inline-block';
          btnEl.disabled = false;
          btnEl.textContent = '🚀 音声エンジンを起動';
        }
      }
    }
  } catch (e) {
    console.warn('TTS status check error:', e);
  }
  return false;
}

// ユーザーが手動で「音声エンジンを起動」を押したときのハンドラ
async function requestLaunchCoeiroink() {
  const btnEl = document.getElementById('btnLaunchCoeiroink');
  const textEl = document.getElementById('coeiroinkStatusText');
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.textContent = '⏳ 起動中 (約10〜20秒)...';
  }
  if (textEl) {
    textEl.innerHTML = '<span style="color:#fde047;">🟡 音声エンジンを起動しています...</span>';
  }

  try {
    await fetch('/api/tts_launch');
    // 数秒おきにステータス確認
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const ok = await checkCoeiroinkStatus();
      if (ok) {
        alert('🎉 音声エンジン（COEIROINK）の起動が完了しました！\nミントとライムの可愛い声をお楽しみください！');
        break;
      }
    }
  } catch (e) {
    alert('起動リクエスト送信に失敗しました: ' + e);
  }
}

// 定期的にステータスを更新 (10秒ごと)
checkCoeiroinkStatus();
setInterval(checkCoeiroinkStatus, 10000);

// セリフの音声を先行生成してバッファリング（Promiseを保存して並行リクエスト対応）
function prefetchVoice(text, speaker) {
  if (!isVoiceEnabled || !text || audioPrefetchMap.has(text) || isCoeiroinkUnavailable) return;
  const p = (async () => {
    try {
      const ttsRes = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speaker })
      });
      if (ttsRes.ok) {
        const audioBlob = await ttsRes.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.volume = currentVolume;
        return { audio, audioUrl };
      }
    } catch (e) {
      console.warn('TTS prefetch error:', e);
    }
    return null;
  })();
  audioPrefetchMap.set(text, p);
  return p;
}

// Audio要素を直接再生するヘルパー（ロボット声への変なフォールバックは廃止し世界観を保護）
function playAudioDirectly(audioItem, text, speaker) {
  if (!audioItem || !audioItem.audio) {
    return Promise.resolve();
  }
  const { audio, audioUrl } = audioItem;
  audio.volume = currentVolume;
  currentPlayingAudio = audio;

  return new Promise((resolve) => {
    let isResolved = false;
    const finish = () => {
      if (!isResolved) {
        isResolved = true;
        try { URL.revokeObjectURL(audioUrl); } catch(e) {}
        if (currentPlayingAudio === audio) currentPlayingAudio = null;
        resolve();
      }
    };

    audio.onended = finish;
    audio.onerror = finish;

    // 音声の長さに応じたセーフティタイムアウト
    const maxWait = Math.max(4000, text.length * 400);
    setTimeout(finish, maxWait);

    audio.play().catch(() => {
      finish();
    });
  });
}

async function speakText(text, speaker) {
  // 音声OFFの場合は音を鳴らさず即座に終了
  if (!isVoiceEnabled || isCoeiroinkUnavailable) {
    return Promise.resolve();
  }

  stopCurrentSpeech();

  // プリフェッチ済み（または裏で生成中）ならそのPromiseを待機して即再生！
  if (audioPrefetchMap.has(text)) {
    const prefPromise = audioPrefetchMap.get(text);
    audioPrefetchMap.delete(text);
    const prefetched = await prefPromise;
    if (prefetched) {
      return playAudioDirectly(prefetched, text, speaker);
    }
  }

  // プリフェッチが無かった場合の直接生成
  try {
    const ttsRes = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, speaker })
    });

    if (ttsRes.ok) {
      const audioBlob = await ttsRes.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      return playAudioDirectly({ audio, audioUrl }, text, speaker);
    }
  } catch (coeiroinkErr) {
    console.warn('Direct TTS synthesis error:', coeiroinkErr);
  }

  return Promise.resolve();
}


// 3. 音声 ON / OFF トグル（キャラクターの読み上げ発話）
function applyVoiceUIState() {
  const btn = document.getElementById('voiceToggleBtn');
  const icon = document.getElementById('voiceIcon');
  const text = document.getElementById('voiceText');
  const settingCheck = document.getElementById('settingVoiceEnabled');

  if (settingCheck) settingCheck.checked = isVoiceEnabled;
  if (btn && icon && text) {
    if (isVoiceEnabled) {
      btn.className = 'btn-voice-toggle voice-on';
      icon.textContent = '🔊';
      text.textContent = '読み上げ ON';
    } else {
      stopCurrentSpeech();
      btn.className = 'btn-voice-toggle voice-off';
      icon.textContent = '🔇';
      text.textContent = '読み上げ OFF (消音)';
    }
  }
}

function saveVoiceEnabledState(enabled) {
  isVoiceEnabled = enabled;
  localStorage.setItem('isVoiceEnabled', isVoiceEnabled ? 'true' : 'false');
  applyVoiceUIState();
  // サーバー設定ファイル (user_settings.json) にも非同期保存
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voiceEnabled: isVoiceEnabled })
  }).catch(() => {});
}

function toggleVoice() {
  saveVoiceEnabledState(!isVoiceEnabled);
}

function updateVoiceSetting() {
  const check = document.getElementById('settingVoiceEnabled');
  if (check) {
    saveVoiceEnabledState(check.checked);
  }
}

// 3-2. マイク音声操作 ON / OFF トグル（呼び出し・音声会話認識）
function applyMicUIState() {
  const micBtn = document.getElementById('micToggleBtn');
  const micIcon = document.getElementById('micIcon');
  const micText = document.getElementById('micText');
  const micCheck = document.getElementById('settingMicEnabled');
  const liveDot = document.getElementById('micLiveDot');
  const eq = document.getElementById('micEqualizer');

  if (micCheck) micCheck.checked = isSpeechRecEnabled;

  if (micBtn && micText) {
    if (isSpeechRecEnabled) {
      micBtn.className = 'btn-mic-toggle mic-on';
      if (micIcon) micIcon.textContent = '🎙️';
      micText.textContent = 'マイク入力 ON';
      if (liveDot) {
        liveDot.style.background = '#22c55e';
        liveDot.style.boxShadow = '0 0 8px #22c55e';
      }
      if (eq) eq.style.display = 'inline-flex';
      updateVoiceStatusMessage('🎙️ マイク待機中…声を聞いてるよ');
    } else {
      micBtn.className = 'btn-mic-toggle mic-off';
      if (micIcon) micIcon.textContent = '🎙️';
      micText.textContent = 'マイク入力 OFF';
      if (liveDot) {
        liveDot.style.background = '#64748b';
        liveDot.style.boxShadow = 'none';
      }
      if (eq) eq.style.display = 'none';
      updateVoiceStatusMessage('マイク入力 OFF (停止中)');
    }
  }
}

function saveMicEnabledState(enabled) {
  isSpeechRecEnabled = enabled;
  localStorage.setItem('isSpeechRecEnabled', isSpeechRecEnabled ? 'true' : 'false');
  applyMicUIState();

  if (isSpeechRecEnabled) {
    if (speechRecognitionInstance) {
      try { speechRecognitionInstance.start(); } catch (e) {}
    } else {
      initSpeechRecognition();
    }
    startMicrophoneStream(selectedAudioInputId);
  } else {
    if (speechRecognitionInstance) {
      try { speechRecognitionInstance.stop(); } catch (e) {}
    }
    // マイクテストメーター及び常時音声呼び出しのため、currentMediaStreamは停止せず維持
  }


  // バックエンドサーバーの音声リスナーにも即時同期！
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ micEnabled: isSpeechRecEnabled })
  }).catch(() => {});
}

function toggleSpeechRecognition() {
  saveMicEnabledState(!isSpeechRecEnabled);
}

function updateMicSetting() {
  const check = document.getElementById('settingMicEnabled');
  if (check) {
    saveMicEnabledState(check.checked);
  }
}

// 4. タブ切り替え
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active-pane'));

  // 📱 スマホ用ボトムナビゲーションの同期
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    if (item.getAttribute('data-tab') === tabName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // サーバーに現在のタブ状態を送信
  fetch('/api/app_state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tab: tabName })
  }).catch(() => {});

  if (tabName === 'chat') {
    document.getElementById('tabChatBtn').classList.add('active');
    document.getElementById('paneChat').classList.add('active-pane');
  } else if (tabName === 'analytics') {
    document.getElementById('tabAnalyticsBtn').classList.add('active');
    document.getElementById('paneAnalytics').classList.add('active-pane');
    loadAnalyticsData();
  } else if (tabName === 'matches') {
    document.getElementById('tabMatchesBtn').classList.add('active');
    document.getElementById('paneMatches').classList.add('active-pane');
    if (!cachedMatchesData) {
      loadMatchCards();
    }
  } else if (tabName === 'rounds') {
    document.getElementById('tabRoundsBtn').classList.add('active');
    document.getElementById('paneRounds').classList.add('active-pane');
    if (!matchRoundsData) {
      loadMatchRounds();
    }
  } else if (tabName === 'folder') {
    document.getElementById('tabFolderBtn').classList.add('active');
    document.getElementById('paneFolder').classList.add('active-pane');
  } else if (tabName === 'skins') {
    document.getElementById('tabSkinsBtn').classList.add('active');
    document.getElementById('paneSkins').classList.add('active-pane');
    if (!allSkinsCache || allSkinsCache.length === 0) {
      loadSkinsCatalog();
    }
  } else if (tabName === 'partyTools') {
    document.getElementById('tabPartyToolsBtn').classList.add('active');
    document.getElementById('panePartyTools').classList.add('active-pane');
    if (!cachedPartyToolsData) {
      loadPartyToolsData();
    }
  } else if (tabName === 'gamedev') {
    const btn = document.getElementById('tabGameDevBtn');
    const pane = document.getElementById('paneGameDev');
    if (btn) btn.classList.add('active');
    if (pane) pane.classList.add('active-pane');
    initGameDevStudio();
  } else if (tabName === 'settings') {
    document.getElementById('tabSettingsBtn').classList.add('active');
    document.getElementById('paneSettings').classList.add('active-pane');
    refreshAudioDevices();
    loadMobileNetworkInfo();
  }
}

// 📱 スマホ用アバタードロワー表示/非表示トグル
function toggleMobileAvatarPane(forceState) {
  const sidebar = document.getElementById('sidebarAvatarPane');
  if (!sidebar) return;
  if (typeof forceState === 'boolean') {
    if (forceState) {
      sidebar.classList.add('mobile-open');
    } else {
      sidebar.classList.remove('mobile-open');
    }
  } else {
    sidebar.classList.toggle('mobile-open');
  }
}

// 📱 スマホ連携ネットワーク情報（ローカルIP & QRコード）取得・生成
let cachedMobileUrl = "";

async function loadMobileNetworkInfo() {
  try {
    const res = await fetch('/api/network_info');
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.mobile_url) return;

    cachedMobileUrl = data.mobile_url;
    
    // QRコード生成（軽量・安定な Google Chart QR API を使用）
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=${encodeURIComponent(cachedMobileUrl)}`;

    const urlInput = document.getElementById('mobileUrlInput');
    const qrImg = document.getElementById('mobileQrImg');
    const modalUrlInput = document.getElementById('modalMobileUrlInput');
    const modalQrImg = document.getElementById('modalMobileQrImg');

    if (urlInput) urlInput.value = cachedMobileUrl;
    if (qrImg) qrImg.src = qrApiUrl;
    if (modalUrlInput) modalUrlInput.value = cachedMobileUrl;
    if (modalQrImg) modalQrImg.src = qrApiUrl;
  } catch (e) {
    console.warn('loadMobileNetworkInfo error:', e);
  }
}

function openMobileConnectModal() {
  loadMobileNetworkInfo();
  const modal = document.getElementById('mobileConnectModal');
  if (modal) modal.style.display = 'flex';
}

function closeMobileConnectModal() {
  const modal = document.getElementById('mobileConnectModal');
  if (modal) modal.style.display = 'none';
}

function copyMobileUrl(fromModal = false) {
  const targetInput = fromModal ? document.getElementById('modalMobileUrlInput') : document.getElementById('mobileUrlInput');
  const url = targetInput ? targetInput.value : cachedMobileUrl;
  if (!url) return;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      alert(`スマホ用アドレスをコピーしました！\n${url}\n\nスマホのブラウザに貼り付けて開いてください。`);
    }).catch(() => {
      prompt("以下のURLをコピーしてスマホのブラウザで開いてください:", url);
    });
  } else {
    prompt("以下のURLをコピーしてスマホのブラウザで開いてください:", url);
  }
}

// 📱 PWA Service Worker の自動登録（スマホでの「ホーム画面に追加」を有効化）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      console.log('[PWA] ServiceWorker registered successfully:', reg.scope);
    }).catch((err) => {
      console.log('[PWA] ServiceWorker registration skipped:', err);
    });
  });
}





// 5. 設定の保存・反映
function saveSettings() {
  currentVolume = parseFloat(document.getElementById('settingVolume').value);
  aiSpeed = parseFloat(document.getElementById('settingAiSpeed').value);
  hinanoSpeed = parseFloat(document.getElementById('settingHinanoSpeed').value);
  isCameraZoomEnabled = document.getElementById('settingCameraZoom').checked;

  const labelAi = document.getElementById('labelAiSpeed');
  const labelHinano = document.getElementById('labelHinanoSpeed');
  if (labelAi) labelAi.textContent = `${aiSpeed.toFixed(2)}x`;
  if (labelHinano) labelHinano.textContent = `${hinanoSpeed.toFixed(2)}x`;

  saveVoiceCustomSettings();
}

// 声（速度）の設定をサーバーに保存（声優・スタイルは固定）
async function saveVoiceCustomSettings() {
  const aiSpeedInput = document.getElementById('settingAiSpeed');
  const hinanoSpeedInput = document.getElementById('settingHinanoSpeed');
  const statusEl = document.getElementById('voiceSaveStatus');

  const mSpeed = parseFloat(aiSpeedInput?.value || '1.05');
  const lSpeed = parseFloat(hinanoSpeedInput?.value || '1.15');

  aiSpeed = mSpeed;
  hinanoSpeed = lSpeed;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mintSpeakerUuid: "3c37646f-3881-5374-2a83-149267990abc",
        mintStyleId: 0,
        mintSpeedScale: mSpeed,
        limeSpeakerUuid: "292ea286-3d5f-f1cc-157c-66462a6a9d08",
        limeStyleId: 40,
        limeSpeedScale: lSpeed
      })
    });
    if (res.ok && statusEl) {
      statusEl.textContent = '💾 話すスピードを保存しました！';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  } catch (e) {
    console.error('Failed to save voice settings:', e);
  }
}

// 設定画面の個別テスト音声再生
async function testSingleVoice(speaker) {
  const statusEl = document.getElementById('voiceSaveStatus');
  const name = (speaker === 'ai') ? 'ミント' : 'ライム';
  if (statusEl) statusEl.textContent = `🔊 ${name}の音声を生成・再生中...`;

  const phrase = (speaker === 'ai') 
    ? 'マスター、ミントの分析音声はクリアに届いていますでしょうか？'
    : 'やっほーマスター！ライムの声だよ！いつでも呼んでね！';

  try {
    await speakText(phrase, speaker);
    if (statusEl) {
      statusEl.textContent = `✅ ${name}の再生完了！`;
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  } catch (e) {
    if (statusEl) {
      statusEl.textContent = `❌ ${name}の再生エラー`;
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    }
  }
}

// 利用可能なCOEIROINKスピーカー一覧をサーバーから取得してセレクトボックスに動的反映
async function loadAvailableSpeakers() {
  try {
    const res = await fetch('/api/tts_speakers');
    if (!res.ok) return;
    const speakers = await res.json();
    if (!Array.isArray(speakers) || speakers.length === 0) return;

    const mintSelect = document.getElementById('settingMintVoice');
    const limeSelect = document.getElementById('settingLimeVoice');
    if (!mintSelect || !limeSelect) return;

    const currentMintVal = mintSelect.value;
    const currentLimeVal = limeSelect.value;

    mintSelect.innerHTML = '';
    limeSelect.innerHTML = '';

    speakers.forEach(spk => {
      const spkName = spk.speakerName || 'キャラクター';
      const spkUuid = spk.speakerUuid;
      const styles = spk.styles || [];

      styles.forEach(style => {
        const val = `${spkUuid}:${style.styleId}`;
        const label = `${spkName} (${style.styleName})`;

        const optMint = document.createElement('option');
        optMint.value = val;
        optMint.textContent = label;
        mintSelect.appendChild(optMint);

        const optLime = document.createElement('option');
        optLime.value = val;
        optLime.textContent = label;
        limeSelect.appendChild(optLime);
      });
    });

    if (currentMintVal) mintSelect.value = currentMintVal;
    if (currentLimeVal) limeSelect.value = currentLimeVal;
  } catch (err) {
    console.warn('Failed to load dynamic speakers:', err);
  }
}

// サーバーまたはローカルストレージからプレイヤー設定＆API設定を読み込んでUIに反映
async function loadServerSettings() {
  // 1. まず端末の localStorage から即座に読み込み（スマホ・Web単体でも設定が維持される！）
  const localPlayerName = localStorage.getItem('playerName') || 'ばけたん';
  const localPlayerTag = localStorage.getItem('playerTag') || '0911';
  const localRank = localStorage.getItem('rank') || 'UNRANKED';
  const localModel = localStorage.getItem('geminiModel') || 'gemini-1.5-flash';
  const localApiKey = localStorage.getItem('geminiApiKey') || '';
  const localSetupDone = localStorage.getItem('setupCompleted') === 'true';

  let settings = {
    playerName: localPlayerName,
    playerTag: localPlayerTag,
    rank: localRank,
    geminiModel: localModel,
    geminiApiKey: localApiKey,
    setupCompleted: localSetupDone
  };

  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const serverSettings = await res.json();
      settings = Object.assign(settings, serverSettings);
      // サーバー設定があればlocalStorageも更新
      if (serverSettings.playerName) localStorage.setItem('playerName', serverSettings.playerName);
      if (serverSettings.playerTag) localStorage.setItem('playerTag', serverSettings.playerTag);
      if (serverSettings.setupCompleted) localStorage.setItem('setupCompleted', 'true');
    }
  } catch (err) {
    console.log('Server not reachable, using localStorage settings:', err);
  }

  const nameInput = document.getElementById('settingPlayerName');
  const tagInput = document.getElementById('settingPlayerTag');
  const rankInput = document.getElementById('settingRankBadge');
  const modelSelect = document.getElementById('settingModel');
  const keyInput = document.getElementById('settingApiKey');

  if (nameInput) nameInput.value = settings.playerName || '';
  if (tagInput) tagInput.value = settings.playerTag || '';
  if (rankInput) rankInput.value = settings.rank || 'UNRANKED';
  if (modelSelect) modelSelect.value = settings.geminiModel || 'gemini-1.5-flash';
  if (keyInput) keyInput.value = settings.geminiApiKey || '';

  // ヘッダー表示も更新
  updateHeaderPlayerDisplay(settings.playerName, settings.playerTag, settings.rank);

  // プレイヤー名が設定されている場合のみ最新ランクとアイコンをTracker Network APIから自動取得
  if (settings.playerName && settings.playerTag) {
    fetchLiveRankAndUpdate();
  }

  // 読み上げ設定の復元（localStorage優先、未設定ならサーバーの保存値）
  if (settings.voiceEnabled !== undefined && savedVoicePref === null) {
    isVoiceEnabled = Boolean(settings.voiceEnabled);
  }
  applyVoiceUIState();

  // マイク操作設定の復元（localStorage優先、未設定ならサーバーの保存値）
  if (settings.micEnabled !== undefined && savedMicPref === null) {
    isSpeechRecEnabled = Boolean(settings.micEnabled);
  }
  applyMicUIState();

  // PC自動起動設定の復元
  const autoStartCheck = document.getElementById('settingAutoStart');
  if (autoStartCheck && settings.autoStartWithWindows !== undefined) {
    autoStartCheck.checked = Boolean(settings.autoStartWithWindows);
  }

  // 音声設定（話速）の復元
  mintVoice = "3c37646f-3881-5374-2a83-149267990abc:0";
  limeVoice = "292ea286-3d5f-f1cc-157c-66462a6a9d08:40";
  if (settings.mintSpeedScale !== undefined) {
    aiSpeed = parseFloat(settings.mintSpeedScale);
    const aiSpeedInput = document.getElementById('settingAiSpeed');
    const labelAi = document.getElementById('labelAiSpeed');
    if (aiSpeedInput) aiSpeedInput.value = aiSpeed;
    if (labelAi) labelAi.textContent = `${aiSpeed.toFixed(2)}x`;
  }
  if (settings.limeSpeedScale !== undefined) {
    hinanoSpeed = parseFloat(settings.limeSpeedScale);
    const hinanoSpeedInput = document.getElementById('settingHinanoSpeed');
    const labelHinano = document.getElementById('labelHinanoSpeed');
    if (hinanoSpeedInput) hinanoSpeedInput.value = hinanoSpeed;
    if (labelHinano) labelHinano.textContent = `${hinanoSpeed.toFixed(2)}x`;
  }

  // 会話待機時間（デバウンス時間）の復元
  if (settings.voiceChatDebounceSec !== undefined && savedDebouncePref === null) {
    voiceChatDebounceSec = parseFloat(settings.voiceChatDebounceSec);
  }
  const debounceSlider = document.getElementById('settingDebounceSec');
  const labelDebounce = document.getElementById('labelDebounceSec');
  if (debounceSlider) debounceSlider.value = voiceChatDebounceSec;
  if (labelDebounce) labelDebounce.textContent = `${voiceChatDebounceSec.toFixed(1)}秒`;

  // 初回チュートリアル判定（未設定時のみモーダルを表示）
  checkTutorialModal(settings);
}

// 会話送信待機時間（スライダー）の変更反映
function onDebounceSliderChanged(val) {
  voiceChatDebounceSec = parseFloat(val);
  localStorage.setItem('voiceChatDebounceSec', String(voiceChatDebounceSec));
  const label = document.getElementById('labelDebounceSec');
  if (label) label.textContent = `${voiceChatDebounceSec.toFixed(1)}秒`;

  // サーバー設定にも非同期保存
  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voiceChatDebounceSec })
  }).catch(() => {});
}


// PC自動起動（Windows Runレジストリ）の切り替え
async function toggleAutoStartSetting() {
  const check = document.getElementById('settingAutoStart');
  const notice = document.getElementById('autoStartNotice');
  if (!check) return;

  const enabled = check.checked;
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoStartWithWindows: enabled })
    });
    if (res.ok && notice) {
      notice.textContent = enabled 
        ? '✅ PC起動時の自動起動をONに登録しました！' 
        : '✅ PC起動時の自動起動を解除しました。';
      notice.style.color = enabled ? '#4ade80' : '#94a3b8';
      setTimeout(() => {
        notice.textContent = '※ ONにするとWindowsログイン時にバックグラウンドで自動待機します。';
        notice.style.color = '#94a3b8';
      }, 3500);
    }
  } catch (err) {
    console.error('Failed to update auto start setting:', err);
  }
}

function updateHeaderPlayerDisplay(name, tag, rank, iconUrl = null) {
  const pTagEl = document.getElementById('headerPlayerTag');
  const rankEl = document.getElementById('headerRankBadge');
  const iconEl = document.getElementById('headerRankIcon');

  const defaultRank = rank || localStorage.getItem('rank') || 'GOLD 2';

  if (pTagEl) {
    if (name && tag) {
      pTagEl.textContent = `${name}#${tag}`;
    } else if (name) {
      pTagEl.textContent = name;
    } else {
      const storedName = localStorage.getItem('playerName');
      const storedTag = localStorage.getItem('playerTag');
      if (storedName && storedTag) {
        pTagEl.textContent = `${storedName}#${storedTag}`;
      } else {
        pTagEl.textContent = '未設定 (初期設定を行ってください)';
      }
    }
  }
  if (rankEl) rankEl.textContent = defaultRank;
  
  if (iconEl) {
    if (iconUrl) {
      iconEl.src = iconUrl;
    } else {
      // ランク名から公式アイコンURLを自動フォールバック計算
      const rLower = defaultRank.toLowerCase();
      let iconIndex = 13; // default Gold 2
      if (rLower.includes('radiant')) iconIndex = 27;
      else if (rLower.includes('immortal 3')) iconIndex = 26;
      else if (rLower.includes('immortal 2')) iconIndex = 25;
      else if (rLower.includes('immortal 1') || rLower.includes('immortal')) iconIndex = 24;
      else if (rLower.includes('ascendant 3')) iconIndex = 23;
      else if (rLower.includes('ascendant 2')) iconIndex = 22;
      else if (rLower.includes('ascendant 1') || rLower.includes('ascendant')) iconIndex = 21;
      else if (rLower.includes('diamond 3')) iconIndex = 20;
      else if (rLower.includes('diamond 2')) iconIndex = 19;
      else if (rLower.includes('diamond 1') || rLower.includes('diamond')) iconIndex = 18;
      else if (rLower.includes('platinum 3')) iconIndex = 17;
      else if (rLower.includes('platinum 2')) iconIndex = 16;
      else if (rLower.includes('platinum 1') || rLower.includes('platinum')) iconIndex = 15;
      else if (rLower.includes('gold 3')) iconIndex = 14;
      else if (rLower.includes('gold 2')) iconIndex = 13;
      else if (rLower.includes('gold 1') || rLower.includes('gold')) iconIndex = 12;
      else if (rLower.includes('silver 3')) iconIndex = 11;
      else if (rLower.includes('silver 2')) iconIndex = 10;
      else if (rLower.includes('silver 1') || rLower.includes('silver')) iconIndex = 9;
      else if (rLower.includes('bronze 3')) iconIndex = 8;
      else if (rLower.includes('bronze 2')) iconIndex = 7;
      else if (rLower.includes('bronze 1') || rLower.includes('bronze')) iconIndex = 6;
      else if (rLower.includes('iron 3')) iconIndex = 5;
      else if (rLower.includes('iron 2')) iconIndex = 4;
      else if (rLower.includes('iron 1') || rLower.includes('iron')) iconIndex = 3;
      else if (rLower.includes('unranked')) iconIndex = 0;
      iconEl.src = `https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/${iconIndex}.png`;
    }
    iconEl.onerror = () => {
      iconEl.src = 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/13.png';
    };
  }

  // ランクの色味・グラデーションを自動調整
  if (rankEl) {
    applyRankBadgeStyle(rankEl, defaultRank);
  }
}

// ランクに応じたバッジスタイルの適用（Iron〜Radiantまで）
function applyRankBadgeStyle(badgeEl, rankStr) {
  const r = (rankStr || '').toLowerCase();
  if (r.includes('radiant')) {
    badgeEl.style.background = 'linear-gradient(135deg, #fff176, #ffd54f)';
    badgeEl.style.color = '#3e2723';
  } else if (r.includes('immortal')) {
    badgeEl.style.background = 'linear-gradient(135deg, #e11d48, #be123c)';
    badgeEl.style.color = '#fff';
  } else if (r.includes('ascendant')) {
    badgeEl.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    badgeEl.style.color = '#fff';
  } else if (r.includes('diamond')) {
    badgeEl.style.background = 'linear-gradient(135deg, #c084fc, #a855f7)';
    badgeEl.style.color = '#fff';
  } else if (r.includes('platinum')) {
    badgeEl.style.background = 'linear-gradient(135deg, #0ea5e9, #38bdf8)';
    badgeEl.style.color = '#032b42';
  } else if (r.includes('gold')) {
    badgeEl.style.background = 'linear-gradient(135deg, #eab308, #ca8a04)';
    badgeEl.style.color = '#fff';
  } else if (r.includes('silver')) {
    badgeEl.style.background = 'linear-gradient(135deg, #94a3b8, #cbd5e1)';
    badgeEl.style.color = '#0f172a';
  } else if (r.includes('bronze')) {
    badgeEl.style.background = 'linear-gradient(135deg, #b45309, #d97706)';
    badgeEl.style.color = '#fff';
  } else {
    badgeEl.style.background = 'linear-gradient(135deg, #64748b, #475569)';
    badgeEl.style.color = '#fff';
  }
}

// トラッカーAPIから最新のランクを自動取得して反映！
async function fetchLiveRankAndUpdate() {
  try {
    const res = await fetch('/api/profile_rank');
    if (!res.ok) {
      fallbackOfflineRank();
      return;
    }
    const rankData = await res.json();
    
    if (rankData.tierName) {
      const rankInput = document.getElementById('settingRankBadge');
      if (rankInput) rankInput.value = rankData.tierName;
      localStorage.setItem('rank', rankData.tierName);
      
      const pName = document.getElementById('settingPlayerName')?.value || localStorage.getItem('playerName') || '';
      const pTag = document.getElementById('settingPlayerTag')?.value || localStorage.getItem('playerTag') || '';
      updateHeaderPlayerDisplay(pName, pTag, rankData.tierName, rankData.iconUrl);
    } else {
      fallbackOfflineRank();
    }
  } catch (e) {
    console.log('Using offline/cached rank display:', e);
    fallbackOfflineRank();
  }
}

function fallbackOfflineRank() {
  const pName = document.getElementById('settingPlayerName')?.value || localStorage.getItem('playerName') || '';
  const pTag = document.getElementById('settingPlayerTag')?.value || localStorage.getItem('playerTag') || '';
  const savedRank = localStorage.getItem('rank') || 'GOLD 2';
  const rankInput = document.getElementById('settingRankBadge');
  if (rankInput && !rankInput.value) rankInput.value = savedRank;
  updateHeaderPlayerDisplay(pName, pTag, savedRank);
}

// プレイヤー設定の保存（名前、タグ、ランク）
async function savePlayerSettings() {
  const playerName = document.getElementById('settingPlayerName').value.trim();
  const playerTag = document.getElementById('settingPlayerTag').value.trim().replace(/^#/, '');
  const rank = document.getElementById('settingRankBadge').value.trim();

  if (!playerName || !playerTag) {
    alert('プレイヤー名とタグラインを入力してください！');
    return;
  }

  // 端末のlocalStorageに即時保存
  localStorage.setItem('playerName', playerName);
  localStorage.setItem('playerTag', playerTag);
  localStorage.setItem('rank', rank);
  localStorage.setItem('setupCompleted', 'true');
  updateHeaderPlayerDisplay(playerName, playerTag, rank);
  cachedMatchesData = null; // キャッシュクリア
  matchRoundsData = null;

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, playerTag, rank, setupCompleted: true })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      await fetchLiveRankAndUpdate();
    }
  } catch (err) {
    console.log('Saved to localStorage (server not reachable):', err);
  }

  alert(`✅ プレイヤーを「${playerName}#${playerTag}」に設定・保存しました！`);
  if (typeof loadMatchCards === 'function') {
    loadMatchCards(true);
  }
}

// API設定の保存（モデル、APIキー）
async function saveApiSettings() {
  const geminiModel = document.getElementById('settingModel').value;
  const geminiApiKey = document.getElementById('settingApiKey').value.trim();
  const noticeEl = document.getElementById('saveStatusNotice');

  localStorage.setItem('geminiModel', geminiModel);
  localStorage.setItem('geminiApiKey', geminiApiKey);

  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ geminiModel, geminiApiKey })
    });
  } catch (err) {
    console.log('Saved API settings to localStorage:', err);
  }

  if (noticeEl) {
    noticeEl.textContent = '✅ API設定を端末に保存しました！';
    setTimeout(() => { noticeEl.textContent = ''; }, 3000);
  }
}

// チュートリアルモーダルの表示判定（設定ファイルに setupCompleted が true でない、または名前が未設定なら表示）
function checkTutorialModal(settings) {
  const modal = document.getElementById('tutorialModal');
  if (!modal) return;
  // 名前とタグが既に設定にあれば入力欄を同期
  const nameIn = document.getElementById('tutorialPlayerName');
  const tagIn = document.getElementById('tutorialPlayerTag');
  if (nameIn && settings.playerName) nameIn.value = settings.playerName;
  if (tagIn && settings.playerTag) tagIn.value = settings.playerTag;

  // setupCompleted が true でない、またはプレイヤー名が空ならチュートリアルを表示
  if (!settings.setupCompleted || !settings.playerName) {
    modal.style.display = 'flex';
  } else {
    modal.style.display = 'none';
  }
}

function openTutorialManually() {
  const modal = document.getElementById('tutorialModal');
  if (modal) {
    const curName = document.getElementById('settingPlayerName')?.value || '';
    const curTag = document.getElementById('settingPlayerTag')?.value || '';
    const nameIn = document.getElementById('tutorialPlayerName');
    const tagIn = document.getElementById('tutorialPlayerTag');
    if (nameIn) nameIn.value = curName || 'ばけたん';
    if (tagIn) tagIn.value = curTag || '0911';
    modal.style.display = 'flex';
  }
}

async function submitTutorialSetup() {
  const nameInput = document.getElementById('tutorialPlayerName');
  const tagInput = document.getElementById('tutorialPlayerTag');
  const loadBox = document.getElementById('tutorialLoadingBox');
  const startBtn = document.getElementById('btnStartTutorial');
  const loadText = document.getElementById('tutorialLoadingText');

  const pName = (nameInput ? nameInput.value.trim() : '') || 'ばけたん';
  const pTag = (tagInput ? tagInput.value.trim().replace(/^#/, '') : '') || '0911';

  if (loadBox) loadBox.style.display = 'flex';
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.style.opacity = '0.5';
    startBtn.textContent = '🚀 読み込み中...';
  }

  // 設定入力欄およびヘッダーも即座に同期
  const sName = document.getElementById('settingPlayerName');
  const sTag = document.getElementById('settingPlayerTag');
  if (sName) sName.value = pName;
  if (sTag) sTag.value = pTag;
  updateHeaderPlayerDisplay(pName, pTag, 'UNRANKED');

  const finishAndEnterStudio = () => {
    const modal = document.getElementById('tutorialModal');
    if (modal) modal.style.display = 'none';

    // スタート記念の歓迎メッセージをチャットに送信！
    appendUserMessage(`はじめまして！今日からよろしくね！`);
    playDialogueSequence([
      { speaker: 'ai', text: `マスター、ようこそ！「${pName}#${pTag}」のデータを読み込みました！スタッツも全部見れますよ！` },
      { speaker: 'hinano', text: `やったー！今日からよろしくねマスター！一緒にバンバン撃ち合ってランク上げちゃお〜！` }
    ]);
  };

  try {
    // 端末のlocalStorageに確実に保存（次回以降スマホで開いても二度とモーダルが出ない！）
    localStorage.setItem('playerName', pName);
    localStorage.setItem('playerTag', pTag);
    localStorage.setItem('setupCompleted', 'true');

    // サーバーにも設定を保存（setupCompleted を true にして永久保存！）
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerName: pName,
        playerTag: pTag,
        setupCompleted: true
      })
    }).catch(e => console.warn('Settings save warning:', e));
    
    // ランク自動取得（非同期・エラーでも停止させない）
    if (loadText) loadText.textContent = `最新ランクTierバッジを同期中...`;
    fetchLiveRankAndUpdate().catch(() => {});
    
    // 試合カード初期化（非同期・エラーでも停止させない）
    if (loadText) loadText.textContent = `ミント＆ライムのスタジオを準備中...`;
    if (typeof loadMatchCards === 'function') {
      loadMatchCards(true).catch(() => {});
    }
    
    // 0.6秒後にスムーズにスタジオへ
    setTimeout(finishAndEnterStudio, 600);

  } catch (e) {
    console.error('Tutorial error:', e);
    // エラー時でもスタジオに入場可能にする
    finishAndEnterStudio();
  }
}

// ========================================================
// 🖥️ 画面共有（がめきょ）リアルタイム見守り＆応援機能
// マイクラ、Apex、VALORANT、作業、YouTubeなど画面に合わせて2人が感情豊かにコメント！
// ========================================================
let isScreenShareActive = false;
let screenShareStream = null;
let screenShareInterval = null;
const SCREEN_SHARE_INTERVAL_MS = 14000; // 14秒に1回画面を優しくチェック（PC負荷ゼロの省エネ設計）

async function toggleScreenShare() {
  if (isScreenShareActive) {
    stopScreenShare();
  } else {
    await startScreenShare();
  }
}

async function startScreenShare() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert('お使いの環境では画面共有がサポートされていません。');
      return;
    }

    // 画面共有ストリームを取得（Discordのようにゲームウィンドウまたは画面全体を選択可能）
    screenShareStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        frameRate: { max: 15 },
        displaySurface: 'window'
      },
      audio: false,
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include'
    });

    isScreenShareActive = true;
    const btn = document.getElementById('screenShareToggleBtn');
    const text = document.getElementById('screenShareText');
    if (btn) btn.className = 'btn-screen-share-toggle screen-share-on';
    if (text) text.textContent = '画面共有 ON';
    updateVoiceStatusMessage('🖥️ 画面共有中（画面を見て応援するよ！）');

    // ユーザーがブラウザ標準の「共有を停止」ボタンを押した時のハンドリング
    screenShareStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };

    // 開始合図として2人が挨拶
    playDialogueSequence([
      { speaker: 'hinano', text: '画面共有キター！マスターの画面バッチリ見えてるよ！マイクラでもFPSでもなんでも見せてね！' },
      { speaker: 'ai', text: 'はい。マスターのプレイや作業状況に合わせて、リアルタイムで見守り応援させていただきますね。' }
    ]);

    // 定期キャプチャ＆リアクションループ開始
    if (screenShareInterval) clearInterval(screenShareInterval);
    screenShareInterval = setInterval(checkScreenAndReact, SCREEN_SHARE_INTERVAL_MS);

    // 初回は3.5秒後に早速1コマチェック！
    setTimeout(checkScreenAndReact, 3500);

  } catch (err) {
    console.warn('Screen share canceled or failed:', err);
    stopScreenShare();
  }
}

function stopScreenShare() {
  isScreenShareActive = false;
  if (screenShareStream) {
    screenShareStream.getTracks().forEach(track => track.stop());
    screenShareStream = null;
  }
  if (screenShareInterval) {
    clearInterval(screenShareInterval);
    screenShareInterval = null;
  }

  const btn = document.getElementById('screenShareToggleBtn');
  const text = document.getElementById('screenShareText');
  if (btn) btn.className = 'btn-screen-share-toggle screen-share-off';
  if (text) text.textContent = '画面共有 OFF';
  updateVoiceStatusMessage('音声操作 待機中');
}

async function checkScreenAndReact() {
  if (!isScreenShareActive || !screenShareStream || isPlayingDialogue || isActionRunning) return;

  try {
    const videoTrack = screenShareStream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') return;

    // 軽量なCanvasで1コマ静止画をJPEGキャプチャ (640x360 の軽量解像度)
    let bitmap = null;
    if ('ImageCapture' in window) {
      const imageCapture = new ImageCapture(videoTrack);
      bitmap = await imageCapture.grabFrame();
    } else {
      const tempVideo = document.createElement('video');
      tempVideo.srcObject = screenShareStream;
      await tempVideo.play();
      bitmap = tempVideo;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, 640, 360);
    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.55); // 軽量圧縮

    const res = await fetch('/api/screen_reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: jpegDataUrl })
    });

    if (!res.ok) return;
    const data = await res.json();
    if (data.turns && data.turns.length > 0 && !isPlayingDialogue && isScreenShareActive) {
      await playDialogueSequence(data.turns);
    }
  } catch (err) {
    console.warn('Screen capture / reaction error:', err);
  }
}

// ========================================================
// ミント＆ライムの自発トーク（アイドル時のおしゃべり機能）
// ========================================================
let idleTimer = null;
const IDLE_WAIT_TIME = 20000; // 20秒間ユーザー操作がないと自発トーク開始（頻度UP！）
const BUBBLE_DISPLAY_TIME = 6500; // フキダシ表示時間：たっぷり読める 6.5秒！

const IDLE_TOPICS = [
  // 1. 日常・ごはん
  [
    { speaker: 'hinano', text: 'ねえねえミントちゃん、今日のお昼ご飯何食べた〜？' },
    { speaker: 'ai', text: 'わたしですか？ミントティーとサンドイッチですよ。ライムちゃんはまたエナジードリンクですか？' },
    { speaker: 'hinano', text: 'ギクッ…！バレた！？だってあれ飲むとフリックのキレが全然違うんだもん！' },
    { speaker: 'ai', text: 'ふふっ、飲み過ぎには注意してくださいね。マスターが戻ってきたらまた全力でサポートしましょう！' }
  ],
  // 2. 武器の好み（ヴァンダル vs ファントム）
  [
    { speaker: 'hinano', text: 'ミントちゃんはヴァンダル派？それともファントム派？' },
    { speaker: 'ai', text: 'データ上、中遠距離のワンタップ精度を重視するならヴァンダルですが、スモーク抜きの弾道トレーサー消去ならファントムですね。' },
    { speaker: 'hinano', text: 'うちは断然ヴァンダル！頭にパーンッて入ったときの音が脳汁ヤバいんだよね〜！' },
    { speaker: 'ai', text: 'マスターはどっちを愛用しているんでしょうね？気になります！' }
  ],
  // 3. エイム・練習場（ボット撃ち）
  [
    { speaker: 'ai', text: 'ライムちゃん、さっき練習場で射撃訓練してましたよね？' },
    { speaker: 'hinano', text: 'そうなの！100体ボットで初弾ヘッドだけ意識して撃ってた！やっぱり基礎練は裏切らないね！' },
    { speaker: 'ai', text: '素晴らしいですね。試合前の5分間のボット撃ちだけでも、勝率は約12%向上するというデータがありますよ。' },
    { speaker: 'hinano', text: '数字で言われると説得力エグい！マスターも試合前にちょっと練習場行こ？' }
  ],
  // 4. マップの話題（アセント・ヘイヴン・ロータスなど）
  [
    { speaker: 'hinano', text: 'マスターの得意なマップってどこなんだろ？アセント？それともロータスかな？' },
    { speaker: 'ai', text: '気になりますね。アセントのミッド管理が得意な方もいれば、ロータスの回転ドアを使った奇襲が好きな方もいますからね。' },
    { speaker: 'hinano', text: 'どっちも立ち回り次第で無双できるよね！今度どのマップが好きか教えてほしいな〜！' },
    { speaker: 'ai', text: 'はい。マスターの得意マップに合わせた戦術もどんどん提案させていただきます！' }
  ],
  // 5. プリエイム＆クロスヘア
  [
    { speaker: 'ai', text: 'ライムちゃん、先ほどクロスヘアの置き方を研究していたそうですね？' },
    { speaker: 'hinano', text: 'そうなの！角を曲がるときに最初から頭の高さに置いとくだけで、相手が勝手に突っ込んでくるって気づいちゃった！' },
    { speaker: 'ai', text: '素晴らしい気づきです！プリエイムの基本ですね。マスターにもぜひ意識してもらいたいポイントです！' }
  ],
  // 6. スキン・課金トーク
  [
    { speaker: 'hinano', text: 'ねえねえ、ナイトマーケット来ないかな〜！新しい近接武器欲しいんだけど！' },
    { speaker: 'ai', text: 'ライムちゃん、先月もスキン買っていませんでしたか…？お財布と相談してくださいね？' },
    { speaker: 'hinano', text: 'だっていいスキンの銃持つとエイム良くなるんだもん！プラシーボ効果ってやつ！' },
    { speaker: 'ai', text: '確かにメンタル面で自信がつくのは否定できませんね…ふふっ。' }
  ],
  // 7. マスターへの気遣い・リフレッシュ
  [
    { speaker: 'hinano', text: 'ふあぁ〜、ちょっと肩回そっかな！マスター、集中して疲れてない？' },
    { speaker: 'ai', text: '適度な水分補給と深呼吸はエイムの精度維持に欠かせませんからね。' },
    { speaker: 'hinano', text: '連敗したときは1回席立って冷たい水飲むのが一番効くよ！いつでも声かけてねマスター！' }
  ],
  // 8. ランク戦の意気込み
  [
    { speaker: 'hinano', text: '今日の目標は勝率勝ち越し！マスターと一緒にランク爆盛りするぞー！' },
    { speaker: 'ai', text: 'わたしもリアルタイムでスタッツと弱点を即座に分析してバックアップしますね！' },
    { speaker: 'hinano', text: '頼もしい〜！ミントのデータとマスターのフィジカルがあれば無敵じゃん！' }
  ]
];

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(triggerIdleDialogue, IDLE_WAIT_TIME);
}

// ユーザーの何らかの操作（キー入力、クリック）でタイマーをリセット
['mousemove', 'keydown', 'click', 'scroll'].forEach(evt => {
  window.addEventListener(evt, resetIdleTimer, { passive: true });
});

let isPlayingIdleBubbles = false;

async function triggerIdleDialogue() {
  // メインのユーザー会話中、チュートリアル中、またはすでにフキダシ再生中ならスキップ
  const modal = document.getElementById('tutorialModal');
  if (isPlayingDialogue || isPlayingIdleBubbles || (modal && modal.style.display !== 'none')) {
    resetIdleTimer();
    return;
  }

  isPlayingIdleBubbles = true;
  const bubbleMint = document.getElementById('bubbleMint');
  const bubbleLime = document.getElementById('bubbleLime');

  // ランダムに雑談トピックを選択
  const topic = IDLE_TOPICS[Math.floor(Math.random() * IDLE_TOPICS.length)];

  for (let i = 0; i < topic.length; i++) {
    // 途中でユーザーが発言した場合は即座にフキダシを消して終了
    if (isPlayingDialogue) break;

    const turn = topic[i];
    const isMint = (turn.speaker === 'ai');
    const targetBubble = isMint ? bubbleMint : bubbleLime;
    const otherBubble = isMint ? bubbleLime : bubbleMint;

    // 前の相手のフキダシを消す
    if (otherBubble) otherBubble.style.display = 'none';

    if (targetBubble) {
      targetBubble.textContent = turn.text;
      targetBubble.style.display = 'block';
    }

    // 発話インジケーター（音声波形）を軽くぴょこぴょこ点灯（音声は鳴らさない）
    if (isMint) {
      aiIndicator.classList.add('speaking');
      hinanoIndicator.classList.remove('speaking');
    } else {
      hinanoIndicator.classList.add('speaking');
      aiIndicator.classList.remove('speaking');
    }

    // ご要望通り、しっかり読めるよう「約6.5秒」フキダシを表示！
    await new Promise(r => setTimeout(r, BUBBLE_DISPLAY_TIME));
  }

  // 終了後にフキダシをフェードアウト
  if (bubbleMint) bubbleMint.style.display = 'none';
  if (bubbleLime) bubbleLime.style.display = 'none';
  aiIndicator.classList.remove('speaking');
  hinanoIndicator.classList.remove('speaking');

  isPlayingIdleBubbles = false;
  resetIdleTimer();
}

// 起動時にサーバー設定を読み込み
loadServerSettings();
resetIdleTimer();

function toggleBlinkingSetting() {
  isBlinkingEnabled = document.getElementById('settingBlinking').checked;
  if (isBlinkingEnabled) {
    setupBlinking();
  } else {
    clearTimeout(blinkAiTimer);
    clearTimeout(blinkHinanoTimer);
    aiImg.src = ASSETS.ai_normal;
    hinanoImg.src = ASSETS.hinano_normal;
  }
}

// 6. タイプライター表示
function typeWriter(text, element, speed = 20) {
  return new Promise((resolve) => {
    element.textContent = '';
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
        chatHistory.scrollTop = chatHistory.scrollHeight;
      } else {
        clearInterval(interval);
        resolve();
      }
    }, speed);
  });
}

// 7. カメラ演出ディレクター
function setCameraMode(mode) {
  if (!isCameraZoomEnabled && mode !== 'dual') {
    // ズームOFF設定時は位置を変えない
    aiIndicator.classList.toggle('speaking', mode === 'ai');
    hinanoIndicator.classList.toggle('speaking', mode === 'hinano');
    return;
  }

  cameraRig.classList.remove('mode-dual', 'mode-ai', 'mode-hinano');
  cameraRig.classList.add(`mode-${mode}`);

  if (mode === 'ai') {
    aiIndicator.classList.add('speaking');
    hinanoIndicator.classList.remove('speaking');
  } else if (mode === 'hinano') {
    hinanoIndicator.classList.add('speaking');
    aiIndicator.classList.remove('speaking');
  } else {
    aiIndicator.classList.remove('speaking');
    hinanoIndicator.classList.remove('speaking');
  }
}

// 8. ユーザーメッセージ追加
function appendUserMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-msg user-msg';
  msgDiv.innerHTML = `
    <div class="msg-header">
      <span class="speaker-pill" style="background:#0284c7; color:#fff;">マスター</span>
      <span class="msg-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
    </div>
    <div class="msg-body">${escapeHtml(text)}</div>
  `;
  chatHistory.appendChild(msgDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// 9. 会話ターンの再生
let isPlayingDialogue = false;

async function playDialogueSequence(turns) {
  if (isPlayingDialogue) return;
  isPlayingDialogue = true;
  sendBtn.disabled = true;
  userInput.disabled = true;

  for (let idx = 0; idx < turns.length; idx++) {
    const turn = turns[idx];
    const speaker = turn.speaker.toLowerCase();
    const text = turn.text;

    // 話者の枠へズームイン！
    setCameraMode(speaker === 'ai' ? 'ai' : 'hinano');

    // チャットログに新しい発話カードを追加
    const coachMsgDiv = document.createElement('div');
    coachMsgDiv.className = `chat-msg coach-msg turn-${speaker}`;
    
    const speakerLabel = speaker === 'ai' ? 'ミント (アナリスト)' : 'ライム (ゲーマー)';
    const pillClass = speaker === 'ai' ? 'speaker-ai' : 'speaker-hinano';

    coachMsgDiv.innerHTML = `
      <div class="msg-header">
        <span class="speaker-pill ${pillClass}">${speakerLabel}</span>
        <span class="msg-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
      </div>
      <div class="msg-body"></div>
    `;
    chatHistory.appendChild(coachMsgDiv);

    const bodyEl = coachMsgDiv.querySelector('.msg-body');

    // 次のセリフがある場合、裏で先行して音声合成APIを叩いておく（プリフェッチ）
    if (idx + 1 < turns.length) {
      prefetchVoice(turns[idx + 1].text, turns[idx + 1].speaker.toLowerCase());
    }

    // ★ 音声を先に取得・確保（プリフェッチから取得、または即時生成待機）
    let audioItem = null;
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isVoiceEnabled && !isCoeiroinkUnavailable && isLocalHost) {
      if (audioPrefetchMap.has(text)) {
        const pref = audioPrefetchMap.get(text);
        audioPrefetchMap.delete(text);
        try {
          audioItem = await Promise.race([
            pref,
            new Promise(r => setTimeout(r, 6000))
          ]);
        } catch (e) {}
      } else {
        try {
          const pref = prefetchVoice(text, speaker);
          if (pref) {
            audioItem = await Promise.race([
              pref,
              new Promise(r => setTimeout(r, 6000))
            ]);
          }
        } catch (e) {}
      }
    }

    // 音声の長さ（秒数）に合わせてタイプライター速度を滑らかに自動計算（ピッタリ合わせる！）
    let charInterval = 20;
    if (audioItem && audioItem.audio && !isNaN(audioItem.audio.duration) && audioItem.audio.duration > 0.5) {
      charInterval = Math.max(15, Math.floor((audioItem.audio.duration * 1000) / Math.max(1, text.length)));
    }

    // ★ 音声再生とタイプライター文字送りを「同時に」スタート！
    const textPromise = typeWriter(text, bodyEl, charInterval);
    const voicePromise = audioItem ? playAudioDirectly(audioItem, text, speaker) : Promise.resolve();

    await Promise.all([textPromise, voicePromise]);

    // セリフ間の余韻（間隔をテンポのよい0.1秒へ短縮！）
    await new Promise(r => setTimeout(r, 100));
  }


  // 会話終了後：ゆっくりカメラを引いて2人が見える元の距離（引き構図）に戻る！
  setCameraMode('dual');
  isPlayingDialogue = false;
  sendBtn.disabled = false;
  userInput.disabled = false;
  userInput.focus();
}

// 10. メッセージ送信処理
async function sendMessage(message, images = null) {
  if (isPlayingDialogue || !message.trim()) return;

  // アイドル時のフキダシが出ていれば即非表示
  const bubbleMint = document.getElementById('bubbleMint');
  const bubbleLime = document.getElementById('bubbleLime');
  if (bubbleMint) bubbleMint.style.display = 'none';
  if (bubbleLime) bubbleLime.style.display = 'none';

  switchTab('chat');
  appendUserMessage(message);
  userInput.value = '';
  sendBtn.disabled = true;
  userInput.disabled = true;

  // 思考中インジケーター（考え中...）の表示
  const thinkingDiv = document.createElement('div');
  thinkingDiv.className = 'chat-msg coach-msg thinking-msg';
  thinkingDiv.id = 'thinkingIndicator';
  thinkingDiv.innerHTML = `
    <div class="msg-body">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
      <span>ミント＆ライムが解析・考え中...</span>
    </div>
  `;
  chatHistory.appendChild(thinkingDiv);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  try {
    const payload = { message };
    if (images && images.length > 0) {
      payload.images = images;
    }

    let data = null;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        data = await response.json();
      }
    } catch (e) {
      console.log('Backend chat API unavailable, trying client-side AI/fallback mode:', e);
    }

    // サーバーがない場合（GitHub Pages/スマホ単体）のフォールバック対話生成
    if (!data || !data.turns || data.turns.length === 0) {
      data = await generateClientSideDialogue(message);
    }
    
    if (data.turns && data.turns.length > 0) {
      // 1. 全セリフの音声を即座に並行プリフェッチ！
      data.turns.forEach(t => {
        prefetchVoice(t.text, t.speaker.toLowerCase());
      });

      // 2. 読み上げONの場合、思考中インジケーター（考え中...）が出ている間に
      // 最初のセリフの音声合成完了を待機（※ローカルPython/COEIROINKサーバー稼働時のみ待機、GitHub Pagesなどサーバー無し時は即座にスキップ！）
      const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isVoiceEnabled && !isCoeiroinkUnavailable && isLocalHost) {
        const firstTurn = data.turns[0];
        const firstPrefetch = audioPrefetchMap.get(firstTurn.text);
        if (firstPrefetch) {
          try {
            await Promise.race([
              firstPrefetch,
              new Promise(r => setTimeout(r, 6000))
            ]);
          } catch(e) {}
        }
      }

      // 3. 準備が整ったので思考中インジケーターを消して、スムーズに会話劇をスタート！
      const indicator = document.getElementById('thinkingIndicator');
      if (indicator) indicator.remove();

      await playDialogueSequence(data.turns);

      // 試合一覧・戦績表示の要望だった場合、チャット内にビジュアル試合カードを挿入！
      if (/試合一覧|一覧|戦績.*見せて|リスト|最近の試合|直近の試合/i.test(message)) {
        await appendMatchCardsToChat();
      }
    } else {
      throw new Error('返答データが空でした');
    }
  } catch (err) {
    console.error('Error during chat:', err);
    const indicator = document.getElementById('thinkingIndicator');
    if (indicator) indicator.remove();
    setCameraMode('dual');
    isPlayingDialogue = false;
    sendBtn.disabled = false;
    userInput.disabled = false;
  }
}

// 📱 スマホ単体（GitHub Pages）時でもAIチャットと戦績会話ができるクライアント側エンジン
async function generateClientSideDialogue(userMsg) {
  const pName = localStorage.getItem('playerName') || 'ばけたん';
  const pTag = localStorage.getItem('playerTag') || '0911';
  const apiKey = localStorage.getItem('geminiApiKey') || '';

  // 1. Gemini APIキーが設定されている場合は直接Gemini APIを叩く！
  if (apiKey) {
    try {
      const gModel = localStorage.getItem('geminiModel') || 'gemini-1.5-flash';
      const prompt = `あなたは「${pName}#${pTag}」のVALORANT専属コーチデュオ『ミント』と『ライム』です。
マスターからのメッセージ:「${userMsg}」
2人で掛け合いをしながら短くテンポよく返答してください。必ず以下のJSON配列フォーマットのみで出力してください:
[{"speaker":"ai","text":"ミントのセリフ"},{"speaker":"hinano","text":"ライムのセリフ"}]`;

      const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      if (gRes.ok) {
        const gJson = await gRes.json();
        let content = gJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { turns: parsed };
        }
      }
    } catch (e) {
      console.warn('Direct Gemini API call failed:', e);
    }
  }

  // 2. キー未設定またはエラー時のインテリジェントな掛け合い応答（戦績・エイム・日常）
  const msg = userMsg.toLowerCase();
  if (msg.includes('戦績') || msg.includes('試合') || msg.includes('ランク') || msg.includes('最近')) {
    return {
      turns: [
        { speaker: 'ai', text: `マスター、直近のカルテを確認しました！LotusでのClove29キルなど、撃ち合いの爆発力は非常に素晴らしい数値が出ています！` },
        { speaker: 'hinano', text: `うんうん！マスターのエイムめっちゃキレキレじゃん！この調子でガンガンランク回していこー！` }
      ]
    };
  } else if (msg.includes('スキン') || msg.includes('ショップ') || msg.includes('ストア') || msg.includes('武器')) {
    return {
      turns: [
        { speaker: 'ai', text: `ストア・スキン図鑑タブから、VALORANT全スキンの3Dモデルや演出動画をチェックできますよ。` },
        { speaker: 'hinano', text: `マスター、お気に入りの武器あったらウィッシュリストに入れといてね！入荷したら教えるから！` }
      ]
    };
  } else if (msg.includes('こんにちは') || msg.includes('はじめ') || msg.includes('よろしく') || msg.includes('やっほ')) {
    return {
      turns: [
        { speaker: 'ai', text: `マスター、こんにちは！今日もコンディションを整えて勝利を掴みましょう！` },
        { speaker: 'hinano', text: `やっほーマスター！今日も一緒に楽しくVALOやろー！` }
      ]
    };
  } else if (msg.includes('負け') || msg.includes('勝てない') || msg.includes('悔しい') || msg.includes('エイム')) {
    return {
      turns: [
        { speaker: 'ai', text: `負けが続いた時は、一度深呼吸して視点移動の置きエイムを再確認しましょう。マスターの実力なら必ず上がれます！` },
        { speaker: 'hinano', text: `ドンマイドンマイ！1回水分補給して肩回してこ！次は絶対勝てるよ！` }
      ]
    };
  } else {
    return {
      turns: [
        { speaker: 'ai', text: `マスター、「${userMsg}」ですね！しっかり受け止めました。何でも相談してください！` },
        { speaker: 'hinano', text: `うんうん！ミントとライムがいつでもついてるからねー！` }
      ]
    };
  }
}

function handleChatSubmit(e) {
  e.preventDefault();
  const text = userInput.value.trim();
  if (text) {
    sendMessage(text);
  }
}

function sendQuickMessage(text) {
  if (isPlayingDialogue) return;
  sendMessage(text);
}

async function syncMatches() {
  const syncBtn = document.querySelector('.btn-sync');
  syncBtn.textContent = '同期中...';
  syncBtn.disabled = true;
  try {
    await fetch('/api/sync', { method: 'POST' });
    syncBtn.textContent = '同期完了!';
    setTimeout(() => {
      syncBtn.textContent = '🔄 戦績同期';
      syncBtn.disabled = false;
    }, 2000);
  } catch (e) {
    syncBtn.textContent = '同期失敗';
    setTimeout(() => {
      syncBtn.textContent = '🔄 戦績同期';
      syncBtn.disabled = false;
    }, 2000);
  }
}

// ========================================================
// 11. クリップ・動画＆ファイル読み込み機能 (Gemini マルチモーダル診断！)
// ========================================================
let currentLoadedFile = {
  name: '',
  type: '', // 'video' | 'image' | 'text'
  url: '',
  content: '',
  frames: [] // base64 画像フレーム一覧 (メモリ上のみ)
};

const dropZone = document.getElementById('dropZone');

['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  }, false);
});

dropZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files.length > 0) {
    readFile(files[0]);
  }
});

function triggerFileInput() {
  document.getElementById('fileInput').click();
}

function handleFileSelected(e) {
  if (e.target.files.length > 0) {
    readFile(e.target.files[0]);
  }
}

async function readFile(file) {
  currentLoadedFile.name = file.name;
  currentLoadedFile.frames = [];
  document.getElementById('fileNameDisplay').textContent = file.name;
  document.getElementById('loadedFileInfo').style.display = 'block';

  const videoEl = document.getElementById('videoPreview');
  const imgEl = document.getElementById('imagePreview');
  const textEl = document.getElementById('fileContentPreview');
  const badgeEl = document.getElementById('fileTypeBadge');
  const statusEl = document.getElementById('clipAnalyzingStatus');

  videoEl.style.display = 'none';
  imgEl.style.display = 'none';
  textEl.style.display = 'none';
  statusEl.style.display = 'none';

  if (file.type.startsWith('video/')) {
    currentLoadedFile.type = 'video';
    badgeEl.textContent = 'MP4 / クリップ動画';
    badgeEl.style.background = '#8b5cf6';
    videoEl.src = URL.createObjectURL(file);
    videoEl.style.display = 'block';

    // 動画から代表的な4〜5フレームをメモリ上（Canvas）で高速抽出
    statusEl.innerHTML = '<span class="spin-icon">⏳</span> 動画の重要フレームをメモリ上で準備中...';
    statusEl.style.display = 'block';
    currentLoadedFile.frames = await extractVideoFrames(videoEl, 5);
    statusEl.innerHTML = `✅ 動画準備完了！ ${currentLoadedFile.frames.length}コマのフレームを解析スタンバイ中！`;
  } else if (file.type.startsWith('image/')) {
    currentLoadedFile.type = 'image';
    badgeEl.textContent = '画像 / スクリーンショット';
    badgeEl.style.background = '#ec4899';
    const reader = new FileReader();
    reader.onload = (e) => {
      imgEl.src = e.target.result;
      imgEl.style.display = 'block';
      currentLoadedFile.frames = [e.target.result];
    };
    reader.readAsDataURL(file);
  } else {
    currentLoadedFile.type = 'text';
    badgeEl.textContent = 'TEXT / コード';
    badgeEl.style.background = '#3b82f6';
    const reader = new FileReader();
    reader.onload = (e) => {
      currentLoadedFile.content = e.target.result;
      textEl.textContent = e.target.result.slice(0, 1500) + (e.target.result.length > 1500 ? '\n... (以下省略)' : '');
      textEl.style.display = 'block';
    };
    reader.readAsText(file);
  }
}

// 動画から均等にNコマのフレームをメモリ上(Canvas)でBase64抽出
function extractVideoFrames(videoEl, frameCount = 5) {
  return new Promise((resolve) => {
    videoEl.onloadedmetadata = async () => {
      const duration = videoEl.duration || 10;
      const canvas = document.createElement('canvas');
      // 高速処理のため長辺720pxにリサイズ
      const scale = Math.min(1.0, 720 / Math.max(videoEl.videoWidth || 1280, videoEl.videoHeight || 720));
      canvas.width = (videoEl.videoWidth || 1280) * scale;
      canvas.height = (videoEl.videoHeight || 720) * scale;
      const ctx = canvas.getContext('2d');

      const frames = [];
      const step = duration / (frameCount + 1);

      for (let i = 1; i <= frameCount; i++) {
        const targetTime = step * i;
        await seekVideo(videoEl, targetTime);
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        frames.push(canvas.toDataURL('image/jpeg', 0.85));
      }

      // 再生位置を先頭に戻す
      videoEl.currentTime = 0;
      resolve(frames);
    };
  });
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

// クリップ・動画診断の実行
async function diagnoseClip(mode) {
  if (!currentLoadedFile.name) return;

  let prompt = '';
  if (mode === 'aim') {
    prompt = `【クリップ映像診断: エイム・感度診断】\nファイル名: ${currentLoadedFile.name}\n添付したクリップ動画/画像のクロスヘアの動き、初弾の位置、フリック時の行き過ぎ（オーバーシュート）や届かなさ（アンダーシュート）、ブレを詳しく見て、感度（センシ）を上げるべきか下げるべきか、どうエイムを改善すべきかアイとひなので徹底的にコーチングしてください！`;
  } else if (mode === 'positioning') {
    prompt = `【クリップ映像診断: 立ち回り・射線管理診断】\nファイル名: ${currentLoadedFile.name}\n添付したクリップ動画/画像のポジショニング、身体の晒し方、射線の管理、ピークのタイミング、スキルの使い方、人数有利での立ち回りを細かく見て、何が良くて何が危険だったかアイとひなので議論・アドバイスしてください！`;
  } else {
    prompt = `【クリップ映像診断: 総合アドバイス＆反省会】\nファイル名: ${currentLoadedFile.name}\n添付したクリップ動画/画像を総合的に見て、撃ち合いの勝因/敗因、立ち回り、エイム、次への改善点をアイとひなので楽しく掛け合いしながら教えてください！`;
  }

  // チャットタブへ遷移し、画像をマルチモーダルで送信！
  switchTab('chat');
  await sendMessage(prompt, currentLoadedFile.frames);
}

// ========================================================
// 12. TRNスタイル ラウンドタイムライン＆リプレイエンジン
// ========================================================
// TRNスタイル ラウンドタイムライン＆キルカード ロジック
// ========================================================
let matchRoundsData = null;
let currentSelectedRound = 1;
let currentMatchId = null;

// ドロップダウン用試合リストの初期化
async function populateRoundsMatchSelect() {
  const select = document.getElementById('roundsMatchSelect');
  if (!select) return;
  const matches = await fetchRecentMatches();
  if (!matches || matches.length === 0) return;

  select.innerHTML = '';
  matches.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `#${m.index} ${m.map} (${m.agent}) - ${m.result} (${m.roundsWon}-${m.roundsLost}) KD: ${m.kd}`;
    select.appendChild(opt);
  });

  if (currentMatchId) {
    select.value = currentMatchId;
  }
}

async function onRoundsMatchSelectChanged(matchId) {
  if (!matchId) return;
  currentMatchId = matchId;
  currentSelectedRound = 1;
  await loadMatchRounds(matchId);
}

// 試合カードから「ラウンド詳細を見る」で直接遷移する関数
async function viewMatchRoundsFromCard(matchId) {
  currentMatchId = matchId;
  currentSelectedRound = 1;
  switchTab('rounds');
  const select = document.getElementById('roundsMatchSelect');
  if (select) select.value = matchId;
  await loadMatchRounds(matchId);
}

async function loadMatchRounds(matchId = null) {
  const pillsContainer = document.getElementById('roundsPillsList');
  pillsContainer.innerHTML = '<span style="color:#94a3b8; font-size:12px; padding:8px;">データ取得中...</span>';

  // 試合セレクターの項目がまだ無ければ構築
  await populateRoundsMatchSelect();

  try {
    const url = matchId ? `/api/rounds?matchId=${encodeURIComponent(matchId)}` : '/api/rounds';
    const res = await fetch(url);
    matchRoundsData = await res.json();
    
    if (matchRoundsData.matchId) {
      currentMatchId = matchRoundsData.matchId;
      const select = document.getElementById('roundsMatchSelect');
      if (select && select.value !== currentMatchId) {
        select.value = currentMatchId;
      }
    }

    // マップ・エージェントバッジ更新
    const mapBadge = document.getElementById('roundsMapBadge');
    const agentBadge = document.getElementById('roundsAgentBadge');
    if (mapBadge) mapBadge.textContent = matchRoundsData.map || 'MAP';
    if (agentBadge) agentBadge.textContent = matchRoundsData.agent || 'AGENT';

    renderRoundsPills();
    renderRoundDetails(currentSelectedRound);
    renderMatchScoreboard(matchRoundsData);
  } catch (err) {
    pillsContainer.innerHTML = '<span style="color:#f87171; font-size:12px; padding:8px;">取得失敗</span>';
    console.error('Error loading rounds:', err);
  }
}

function renderRoundsPills() {
  const pillsContainer = document.getElementById('roundsPillsList');
  pillsContainer.innerHTML = '';

  if (!matchRoundsData || !matchRoundsData.rounds) return;

  const rounds = matchRoundsData.rounds;
  const roundNums = Object.keys(rounds).map(Number).sort((a,b) => a - b);

  if (roundNums.length === 0) {
    pillsContainer.innerHTML = '<span style="color:#94a3b8; font-size:12px; padding:8px;">ラウンドデータなし</span>';
    return;
  }

  // 選択中ラウンドが範囲外なら最初のラウンドに合わせる
  if (!roundNums.includes(currentSelectedRound)) {
    currentSelectedRound = roundNums[0];
  }

  roundNums.forEach(rNum => {
    const rInfo = rounds[rNum];
    const isWin = rInfo.win;

    const pill = document.createElement('div');
    pill.className = `trn-round-pill ${isWin ? 'pill-win' : 'pill-loss'} ${rNum === currentSelectedRound ? 'active-pill' : ''}`;
    pill.id = `roundPill-${rNum}`;
    pill.onclick = () => selectRound(rNum);

    pill.innerHTML = `
      <div class="pill-number">${rNum}</div>
      <div class="pill-bar ${isWin ? 'bar-win' : 'bar-loss'}"></div>
      <div class="pill-icon">${isWin ? '🛡️' : '💥'}</div>
    `;

    pillsContainer.appendChild(pill);
  });
}

function selectRound(rNum) {
  currentSelectedRound = rNum;
  document.querySelectorAll('.trn-round-pill').forEach(el => el.classList.remove('active-pill'));
  const targetPill = document.getElementById(`roundPill-${rNum}`);
  if (targetPill) {
    targetPill.classList.add('active-pill');
    targetPill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
  renderRoundDetails(rNum);
}

function navigateRound(direction) {
  if (!matchRoundsData || !matchRoundsData.rounds) return;
  const roundNums = Object.keys(matchRoundsData.rounds).map(Number).sort((a,b) => a - b);
  const currentIdx = roundNums.indexOf(currentSelectedRound);
  const nextIdx = currentIdx + direction;
  if (nextIdx >= 0 && nextIdx < roundNums.length) {
    selectRound(roundNums[nextIdx]);
  }
}

function renderRoundDetails(rNum) {
  if (!matchRoundsData) return;
  const rInfo = matchRoundsData.rounds ? matchRoundsData.rounds[rNum] : null;
  const events = (matchRoundsData.events && matchRoundsData.events[rNum]) ? matchRoundsData.events[rNum] : [];
  const hits = (matchRoundsData.hits && matchRoundsData.hits[rNum]) ? matchRoundsData.hits[rNum] : { head: 0, body: 0, leg: 0, damage: 0 };

  // ヘッダー更新 (英語＋日本語ルビ)
  const titleLabel = document.getElementById('roundTitleLabel');
  const badgeEn = document.getElementById('roundStatusEn');
  const badgeJp = document.getElementById('roundStatusJp');
  const badge = document.getElementById('roundStatusBadge');

  titleLabel.textContent = `ROUND ${rNum}`;
  if (rInfo) {
    const isWin = rInfo.win;
    const resType = (rInfo.result || 'elimination').toLowerCase();
    
    let enText = `${isWin ? 'VICTORY' : 'DEFEAT'} / ${rInfo.result ? rInfo.result.toUpperCase() : 'ROUND END'}`;
    let jpText = isWin ? '勝利' : '敗北';
    if (resType.includes('elim')) jpText += ' (敵全滅)';
    else if (resType.includes('defuse')) jpText += isWin ? ' (スパイク解除成功)' : ' (解除阻止失敗)';
    else if (resType.includes('detonate') || resType.includes('bomb')) jpText += isWin ? ' (起爆成功)' : ' (スパイク起爆された)';
    else if (resType.includes('time')) jpText += ' (時間切れ)';

    if (badgeEn) badgeEn.textContent = enText;
    if (badgeJp) badgeJp.textContent = jpText;
    if (badge) badge.className = `round-status-badge ${isWin ? 'status-win' : 'status-loss'}`;
  }

  // 部位別命中数バッジ更新 (自分が与えたダメージ)
  const hitHead = document.getElementById('hitHeadVal');
  const hitBody = document.getElementById('hitBodyVal');
  const hitLeg = document.getElementById('hitLegVal');
  const hitDmg = document.getElementById('hitDmgVal');

  if (hitHead) hitHead.textContent = hits.head || 0;
  if (hitBody) hitBody.textContent = hits.body || 0;
  if (hitLeg) hitLeg.textContent = hits.leg || 0;
  if (hitDmg) hitDmg.textContent = hits.damage || 0;

  // 部位別被弾数バッジ更新 (自分が食らったダメージ)
  const hitRecvHead = document.getElementById('hitRecvHeadVal');
  const hitRecvBody = document.getElementById('hitRecvBodyVal');
  const hitRecvDmg = document.getElementById('hitRecvDmgVal');

  if (hitRecvHead) hitRecvHead.textContent = hits.recvHead || 0;
  if (hitRecvBody) hitRecvBody.textContent = hits.recvBody || 0;
  if (hitRecvDmg) hitRecvDmg.textContent = hits.recvDamage || 0;

  // 交戦（デュエル）内訳カード（自分が与えたダメージ ＆ 相手から食らったダメージ）を描画！
  const duelsWrapper = document.getElementById('roundDuelsWrapper');
  const duelsList = document.getElementById('roundDuelsList');
  if (duelsWrapper && duelsList) {
    const hasDealt = hits.duels && hits.duels.length > 0;
    const hasRecv = hits.recvDuels && hits.recvDuels.length > 0;

    if (hasDealt || hasRecv) {
      duelsList.innerHTML = '';

      // 自分が与えたダメージカード
      if (hasDealt) {
        hits.duels.forEach(duel => {
          const dCard = document.createElement('div');
          dCard.className = 'duel-agent-card duel-card-dealt';
          dCard.innerHTML = `
            <img class="duel-agent-icon" src="${duel.opponentIcon || 'https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png'}" alt="${duel.opponent}" onerror="this.src='https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png'" />
            <div class="duel-agent-info">
              <span class="duel-agent-name"><span class="badge-tag-dealt">与ダメ</span> 対 ${duel.opponent}</span>
              <div class="duel-hits-row">
                <span class="duel-hit-badge d-head" title="頭に当てた弾数">頭: <b>${duel.head}</b></span>
                <span class="duel-hit-badge d-body" title="胴体に当てた弾数">胴: <b>${duel.body}</b></span>
                ${duel.leg > 0 ? `<span class="duel-hit-badge d-leg" title="脚に当てた弾数">脚: <b>${duel.leg}</b></span>` : ''}
                <span class="duel-hit-badge d-dmg">${duel.damage} 与DMG</span>
              </div>
            </div>
          `;
          duelsList.appendChild(dCard);
        });
      }

      // 自分が食らった被ダメージカード
      if (hasRecv) {
        hits.recvDuels.forEach(duel => {
          const dCard = document.createElement('div');
          dCard.className = 'duel-agent-card duel-card-recv';
          dCard.innerHTML = `
            <img class="duel-agent-icon" src="${duel.opponentIcon || 'assets/hinano.png'}" alt="${duel.opponent}" onerror="this.src='assets/hinano.png'" />
            <div class="duel-agent-info">
              <span class="duel-agent-name"><span class="badge-tag-recv">被ダメ</span> から ${duel.opponent}</span>
              <div class="duel-hits-row">
                <span class="duel-hit-badge d-head" title="頭に食らった弾数">頭被弾: <b>${duel.head}</b></span>
                <span class="duel-hit-badge d-body" title="胴体に食らった弾数">胴被弾: <b>${duel.body}</b></span>
                <span class="duel-hit-badge d-recv-dmg">${duel.damage} 被DMG</span>
              </div>
            </div>
          `;
          duelsList.appendChild(dCard);
        });
      }

      duelsWrapper.style.display = 'flex';
    } else {
      duelsWrapper.style.display = 'none';
    }
  }

  // イベントカードの生成 (キル・デスログ)
  const container = document.getElementById('roundEventsContainer');
  container.innerHTML = '';

  if (events.length === 0) {
    container.innerHTML = '<div class="no-events-notice">このラウンドのキル・デスログはありません</div>';
    return;
  }

  // 時間順にソート
  events.sort((a, b) => a.time.localeCompare(b.time));

  events.forEach(ev => {
    const card = document.createElement('div');
    const isFriendlyKill = ev.killerIsMyTeam;
    
    // 自分が関わっているか（自分がキルしたのか、自分が倒されたのか）
    let specialClass = '';
    let meNotice = '';
    if (ev.isMe) {
      specialClass = ' card-event-my-kill';
      meNotice = '<span class="event-my-label my-kill-tag">★ あなたのキル！</span>';
    } else if (ev.victimIsMe) {
      specialClass = ' card-event-my-death';
      meNotice = '<span class="event-my-label my-death-tag">💀 あなたのデス</span>';
    }

    card.className = `trn-kill-card ${isFriendlyKill ? 'card-team-kill' : 'card-enemy-kill'}${specialClass}`;

    card.innerHTML = `
      <div class="card-actor killer-side">
        <img class="agent-avatar ${ev.isMe ? 'avatar-me' : ''}" src="${ev.killerIcon || 'https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png'}" alt="${ev.killerAgent}" onerror="this.src='https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png'" />
        <span class="actor-name ${ev.isMe ? 'name-me' : ''}">${ev.isMe ? 'あなた' : ev.killerAgent}</span>
      </div>
      <div class="card-center-info">
        <div class="card-time">${ev.time}</div>
        <div class="card-weapon">
          ${ev.weaponIcon ? `<img class="weapon-icon" src="${ev.weaponIcon}" alt="${ev.weapon}" />` : `<span>${ev.weapon}</span>`}
        </div>
        <div class="card-dist">${ev.dist || ''}</div>
        ${meNotice}
      </div>
      <div class="card-actor victim-side">
        <span class="actor-name ${ev.victimIsMe ? 'name-me' : ''}">${ev.victimIsMe ? 'あなた' : ev.victimAgent}</span>
        <img class="agent-avatar ${ev.victimIsMe ? 'avatar-me' : ''}" src="${ev.victimIcon || 'https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png'}" alt="${ev.victimAgent}" onerror="this.src='https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png'" />
      </div>
    `;

    container.appendChild(card);
  });
}

function askCoachCurrentRound() {
  const map = matchRoundsData ? matchRoundsData.map : '最新試合';
  const hits = (matchRoundsData && matchRoundsData.hits && matchRoundsData.hits[currentSelectedRound]) 
    ? matchRoundsData.hits[currentSelectedRound] 
    : { head: 0, body: 0, leg: 0, damage: 0, recvHead: 0, recvBody: 0, recvDamage: 0 };
  
  let hitDesc = `（【自分が与えたダメージ】: 頭${hits.head||0}発/胴${hits.body||0}発/計${hits.damage||0}DMG、` +
                `【相手から食らった被弾】: 頭被弾${hits.recvHead||0}発/胴被弾${hits.recvBody||0}発/被ダメ${hits.recvDamage||0}DMG）`;
  const prompt = `${map}のラウンド${currentSelectedRound}について詳しく解説して！${hitDesc} 自分が相手に与えたダメージと、相手から食らった被弾状況を明確に分けて、エイムや立ち回りを分析して！`;
  switchTab('chat');
  sendMessage(prompt);
}

// 👥 試合全参加者スコアボード（味方 / 敵、非公開プレイヤー安全表示）の描画
function renderMatchScoreboard(data) {
  const wrapper = document.getElementById('matchScoreboardWrapper');
  const friendlyTbody = document.getElementById('friendlyScoreboardBody');
  const enemyTbody = document.getElementById('enemyScoreboardBody');

  if (!wrapper || !friendlyTbody || !enemyTbody) return;

  const friendlyList = data.friendlyPlayers || [];
  const enemyList = data.enemyPlayers || [];

  if (friendlyList.length === 0 && enemyList.length === 0) {
    wrapper.style.display = 'none';
    return;
  }

  wrapper.style.display = 'block';

  function buildRows(players, isFriendly) {
    return players.map(p => {
      const youBadge = p.isMe ? '<span class="sb-you-badge">★ YOU</span>' : '';
      const privateNotice = p.isPrivate ? '<span class="sb-private-badge">非公開</span>' : '';
      const kdColor = p.kdNum >= 1.0 ? '#4ade80' : '#f87171';
      const rankTitle = p.rankName || 'Unranked';
      const rankIcon = p.rankIcon || 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/0.png';

      return `
        <tr class="${p.isMe ? 'sb-row-me' : ''}">
          <td class="sb-col-name">
            <span class="sb-player-name" title="${p.uid}">${p.displayName}</span>
            ${youBadge}
            ${privateNotice}
          </td>
          <td class="sb-col-rank">
            <div class="sb-rank-cell" title="${rankTitle}">
              <img src="${rankIcon}" alt="${rankTitle}" class="sb-rank-icon" onerror="this.src='https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/0.png'" />
              <span class="sb-rank-text">${rankTitle}</span>
            </div>
          </td>
          <td class="sb-col-agent">
            <div class="sb-agent-cell">
              <img src="${p.agentIcon || 'https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png'}" alt="${p.agent}" class="sb-agent-icon" onerror="this.src='https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png'" />
              <span>${p.agent}</span>
            </div>
          </td>
          <td class="sb-col-num"><b>${p.kills}</b></td>
          <td class="sb-col-num">${p.deaths}</td>
          <td class="sb-col-num">${p.assists}</td>
          <td class="sb-col-num"><b style="color:${kdColor};">${p.kd}</b></td>
          <td class="sb-col-num">${p.adr}</td>
          <td class="sb-col-num">${p.hs}</td>
        </tr>
      `;
    }).join('');
  }

  friendlyTbody.innerHTML = buildRows(friendlyList, true);
  enemyTbody.innerHTML = buildRows(enemyList, false);
}

// ========================================================
// 試合一覧ビジュアルカード (K/D・スコアカード) ロジック
// ========================================================
let cachedMatchesData = null;

async function fetchRecentMatches() {
  if (cachedMatchesData && cachedMatchesData.length > 0) return cachedMatchesData;

  // 1. ローカルキャッシュ確認
  const localCached = localStorage.getItem('cachedRecentMatches');
  if (localCached) {
    try {
      const parsed = JSON.parse(localCached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedMatchesData = parsed;
      }
    } catch (e) {}
  }

  // 2. サーバーから最新の試合一覧を取得
  try {
    const res = await fetch('/api/recent_matches');
    if (res.ok) {
      const liveMatches = await res.json();
      if (Array.isArray(liveMatches) && liveMatches.length > 0) {
        cachedMatchesData = liveMatches;
        localStorage.setItem('cachedRecentMatches', JSON.stringify(liveMatches));
        return cachedMatchesData;
      }
    }
  } catch (e) {
    console.log('Server not reachable for matches, using cached or preset matches');
  }

  if (cachedMatchesData && cachedMatchesData.length > 0) {
    return cachedMatchesData;
  }

  // 3. サーバー未接続時でも試合一覧カードが綺麗に動作するよう、ばけたん#0911 の直近対戦データをプリセット表示
  const presetMatches = [
    { index: 1, id: 'm1', map: 'Lotus', mapImage: 'https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/blt7a20c3a2839ba8bb/63bc7503c004c264bfdb8a49/Lotus_FeaturedImage.jpg', agent: 'Clove', agentIcon: 'https://media.valorant-api.com/agents/1dbf2edd-4729-0984-3115-f793152c3aa0/displayicon.png', rankName: 'Gold 2', rankIcon: 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/13.png', result: '敗北', isWin: false, roundsWon: 11, roundsLost: 13, kills: '29', deaths: '24', assists: '6', kd: '1.21', kdNum: 1.21, hs: '30.0', adr: '153', acs: '243' },
    { index: 2, id: 'm2', map: 'Haven', mapImage: 'https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/blt1f24d77cfc1d04ab/5ec335c024d06a4b189b6a78/haven_featured.png', agent: 'Jett', agentIcon: 'https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png', rankName: 'Gold 2', rankIcon: 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/13.png', result: '勝利', isWin: true, roundsWon: 13, roundsLost: 7, kills: '12', deaths: '10', assists: '3', kd: '1.20', kdNum: 1.20, hs: '50.0', adr: '117', acs: '190' },
    { index: 3, id: 'm3', map: 'Lotus', mapImage: 'https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/blt7a20c3a2839ba8bb/63bc7503c004c264bfdb8a49/Lotus_FeaturedImage.jpg', agent: 'Clove', agentIcon: 'https://media.valorant-api.com/agents/1dbf2edd-4729-0984-3115-f793152c3aa0/displayicon.png', rankName: 'Gold 2', rankIcon: 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/13.png', result: '勝利', isWin: true, roundsWon: 13, roundsLost: 9, kills: '12', deaths: '13', assists: '6', kd: '0.92', kdNum: 0.92, hs: '16.0', adr: '122', acs: '194' },
    { index: 4, id: 'm4', map: 'Sunset', mapImage: 'https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/blte9d6756bf02e2d9a/64e83f211516e45136aa23b7/Sunset_Featured_Image.jpg', agent: 'Jett', agentIcon: 'https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png', rankName: 'Gold 2', rankIcon: 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/13.png', result: '敗北', isWin: false, roundsWon: 10, roundsLost: 13, kills: '27', deaths: '19', assists: '4', kd: '1.42', kdNum: 1.42, hs: '41.0', adr: '184', acs: '266' },
    { index: 5, id: 'm5', map: 'Sunset', mapImage: 'https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/blte9d6756bf02e2d9a/64e83f211516e45136aa23b7/Sunset_Featured_Image.jpg', agent: 'Waylay', agentIcon: 'https://media.valorant-api.com/agents/df1cb487-4902-002e-5c17-d28e83e78588/displayicon.png', rankName: 'Gold 2', rankIcon: 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/13.png', result: '勝利', isWin: true, roundsWon: 13, roundsLost: 8, kills: '14', deaths: '14', assists: '4', kd: '1.00', kdNum: 1.00, hs: '27.0', adr: '105', acs: '168' },
    { index: 6, id: 'm6', map: 'Haven', mapImage: 'https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/blt1f24d77cfc1d04ab/5ec335c024d06a4b189b6a78/haven_featured.png', agent: 'Neon', agentIcon: 'https://media.valorant-api.com/agents/bb2a4828-46eb-8cd1-e765-15848195d751/displayicon.png', rankName: 'Gold 1', rankIcon: 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/12.png', result: '勝利', isWin: true, roundsWon: 13, roundsLost: 10, kills: '14', deaths: '21', assists: '2', kd: '0.67', kdNum: 0.67, hs: '29.0', adr: '103', acs: '166' },
    { index: 7, id: 'm7', map: 'Ascent', mapImage: 'https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/blt7200fe417743fa72/5ed56784d14c2b0c30263640/ascent_featured.png', agent: 'Sova', agentIcon: 'https://media.valorant-api.com/agents/320b2a48-4d9b-a075-30f1-1f93a9b638fa/displayicon.png', rankName: 'Gold 1', rankIcon: 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/12.png', result: '敗北', isWin: false, roundsWon: 5, roundsLost: 13, kills: '6', deaths: '14', assists: '2', kd: '0.43', kdNum: 0.43, hs: '46.0', adr: '69', acs: '115' },
    { index: 8, id: 'm8', map: 'Ascent', mapImage: 'https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/blt7200fe417743fa72/5ed56784d14c2b0c30263640/ascent_featured.png', agent: 'Omen', agentIcon: 'https://media.valorant-api.com/agents/8e253930-4c05-31dd-169c-945a19f60c2b/displayicon.png', rankName: 'Gold 1', rankIcon: 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/12.png', result: '敗北', isWin: false, roundsWon: 8, roundsLost: 13, kills: '12', deaths: '14', assists: '3', kd: '0.86', kdNum: 0.86, hs: '40.0', adr: '139', acs: '230' },
    { index: 9, id: 'm9', map: 'Split', mapImage: 'https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/bltd3120199e31d4d8c/5ec335c052c53d4f40f0980c/split_featured.png', agent: 'Raze', agentIcon: 'https://media.valorant-api.com/agents/f94c3b30-42be-e959-889c-5aa313dba261/displayicon.png', rankName: 'Gold 1', rankIcon: 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/12.png', result: '勝利', isWin: true, roundsWon: 13, roundsLost: 6, kills: '13', deaths: '10', assists: '2', kd: '1.30', kdNum: 1.30, hs: '42.0', adr: '103', acs: '175' },
    { index: 10, id: 'm10', map: 'Abyss', mapImage: 'https://images.contentstack.io/v3/assets/bltb6530b271fddd0b1/blt90e1f7281fbfb1c1/666b69b919ca1e2e92cbe38b/Abyss_FeaturedImage.jpg', agent: 'Cypher', agentIcon: 'https://media.valorant-api.com/agents/117ed9e3-49f3-6512-3ccf-0cada7e3823b/displayicon.png', rankName: 'Gold 1', rankIcon: 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/12.png', result: '勝利', isWin: true, roundsWon: 13, roundsLost: 7, kills: '18', deaths: '14', assists: '4', kd: '1.29', kdNum: 1.29, hs: '25.0', adr: '137', acs: '202' }
  ];

  cachedMatchesData = presetMatches;
  return cachedMatchesData;
}

function createMatchCardElement(m) {
  const card = document.createElement('div');
  const isWin = m.isWin;
  card.className = `match-card ${isWin ? 'is-win' : 'is-defeat'}`;

  // K/D比率の色分け
  let kdColorClass = 'kd-even';
  if (m.kdNum >= 1.05) {
    kdColorClass = 'kd-positive';
  } else if (m.kdNum < 0.95) {
    kdColorClass = 'kd-negative';
  }

  const agentFallback = 'https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png';

  card.innerHTML = `
    ${m.mapImage ? `<div class="match-card-bg" style="background-image: url('${m.mapImage}');"></div>` : ''}
    <div class="match-card-content">
      <div class="match-card-agent-box">
        <span class="match-idx-badge">#${m.index}</span>
        <div class="match-agent-img-wrap">
          <img class="match-agent-img" src="${m.agentIcon || agentFallback}" alt="${m.agent}" onerror="this.src='${agentFallback}'" />
        </div>
      </div>

      <div class="match-card-meta">
        <div class="match-map-title">
          <span>${m.map}</span>
          <span class="match-agent-name">(${m.agent})</span>
        </div>
        <div class="match-score-row">
          <span class="match-result-badge ${isWin ? 'win' : 'defeat'}">${m.result}</span>
          <span class="match-rounds-score">${m.roundsWon} - ${m.roundsLost}</span>
          ${m.rankName ? `
            <span class="match-rank-badge" title="この試合のランク: ${m.rankName}">
              <img src="${m.rankIcon || 'https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/0.png'}" alt="${m.rankName}" class="match-rank-badge-icon" onerror="this.src='https://trackercdn.com/cdn/tracker.gg/valorant/icons/tiersv2/0.png'" />
              <span>${m.rankName}</span>
            </span>
          ` : ''}
        </div>
      </div>

      <div class="match-kd-box">
        <span class="match-kd-label">K/D <small>(キルレ)</small></span>
        <span class="match-kd-val ${kdColorClass}">${m.kd}</span>
        <span class="match-kda-sub">${m.kills}キル / ${m.deaths}デス / ${m.assists}アシスト</span>
      </div>

      <div class="match-stats-cols">
        <div class="match-stat-col" title="ヘッドショット率（頭に当たった割合）">
          <span class="match-stat-name">HS% <small style="font-size:9px; opacity:0.8;">(頭命中)</small></span>
          <span class="match-stat-val">${m.hs}%</span>
        </div>
        <div class="match-stat-col" title="1ラウンドあたりの平均ダメージ">
          <span class="match-stat-name">ADR <small style="font-size:9px; opacity:0.8;">(平均ダメ)</small></span>
          <span class="match-stat-val">${m.adr}</span>
        </div>
        <div class="match-stat-col" title="平均戦闘スコア">
          <span class="match-stat-name">ACS <small style="font-size:9px; opacity:0.8;">(戦闘力)</small></span>
          <span class="match-stat-val">${m.acs}</span>
        </div>
      </div>

      <div class="match-card-action">
        <button class="btn-card-rounds" onclick="event.stopPropagation(); viewMatchRoundsFromCard('${m.id}')" title="この試合の全ラウンド勝敗とキルタイムラインを表示">
          🎯 ラウンド解説
        </button>
        <button class="btn-card-ask" onclick="event.stopPropagation(); askAboutMatch(${m.index}, '${m.map}', '${m.agent}', '${m.result}', '${m.kd}')">
          分析を依頼 ▶
        </button>
      </div>
    </div>
  `;

  // カード全体クリックでもラウンド解説へジャンプ
  card.onclick = () => {
    viewMatchRoundsFromCard(m.id);
  };

  return card;
}

async function loadMatchCards(forceRefresh = false) {
  const grid = document.getElementById('matchesCardsGrid');
  if (!grid) return;
  if (forceRefresh) {
    cachedMatchesData = null;
  }
  grid.innerHTML = '<div class="matches-loading">試合データを読み込み中...</div>';

  const matches = await fetchRecentMatches();
  if (!matches || matches.length === 0) {
    grid.innerHTML = '<div class="matches-loading">試合履歴が見つかりませんでした</div>';
    return;
  }

  grid.innerHTML = '';
  matches.forEach(m => {
    const cardEl = createMatchCardElement(m);
    grid.appendChild(cardEl);
  });
}

async function appendMatchCardsToChat() {
  const matches = await fetchRecentMatches();
  if (!matches || matches.length === 0) return;

  const container = document.createElement('div');
  container.className = 'chat-match-cards-container';
  
  // 直近5試合をチャット内にコンパクトに展開
  matches.slice(0, 5).forEach(m => {
    const cardEl = createMatchCardElement(m);
    container.appendChild(cardEl);
  });

  const moreBtn = document.createElement('div');
  moreBtn.style.textAlign = 'center';
  moreBtn.style.padding = '8px 0';
  moreBtn.innerHTML = `
    <button class="btn-chip" onclick="switchTab('matches')" style="font-size:12px; padding:6px 16px;">
      📋 過去10試合の全カードを見る ▶
    </button>
  `;
  container.appendChild(moreBtn);

  chatHistory.appendChild(container);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function askAboutMatch(index, map, agent, result, kd) {
  const prompt = `試合 #${index} (${map} / ${agent} / ${result} / KD: ${kd}) の振り返りとアドバイスをして！`;
  switchTab('chat');
  sendMessage(prompt);
}

// ========================================================
// 📊 総合分析（レーダーチャート・マップ別・エージェント別戦績）
// ========================================================
let cachedAnalyticsData = null;

async function loadAnalyticsData(forceRefresh = false) {
  const winrateEl = document.getElementById('analyticsOverallWinrate');
  const hsEl = document.getElementById('statAvgHs');
  const adrEl = document.getElementById('statAvgAdr');
  const kdEl = document.getElementById('statAvgKd');
  const matchesEl = document.getElementById('statTotalMatches');
  const evalTextEl = document.getElementById('evalText');
  const mapListEl = document.getElementById('mapStatsList');
  const agentListEl = document.getElementById('agentStatsList');

  if (forceRefresh) cachedAnalyticsData = null;

  try {
    let data = cachedAnalyticsData;
    if (!data) {
      const res = await fetch('/api/analytics');
      if (!res.ok) return;
      data = await res.json();
      cachedAnalyticsData = data;
    }

    if (!data.hasData) {
      if (evalTextEl) evalTextEl.textContent = '試合データがありません。戦績を同期してください。';
      return;
    }

    const r = data.radar;
    if (winrateEl) winrateEl.textContent = `直近勝率: ${r.winRate}%`;
    if (hsEl) hsEl.textContent = `${r.avgHs}%`;
    if (adrEl) adrEl.textContent = `${r.avgAdr}`;
    if (kdEl) kdEl.textContent = `${r.avgKd}`;
    if (matchesEl) matchesEl.textContent = `${r.totalMatches}戦 (${r.totalWins}勝)`;

    // 五角形レーダーチャートの描画
    drawRadarChart(r);

    // ミント＆ライムのカルテ診断コメントの自動生成
    if (evalTextEl) {
      let advice = '';
      if (r.avgHs >= 25) {
        advice += `🌱【ミント】「平均HS率が${r.avgHs}%と非常に高水準です。クロスヘアの初弾配置がしっかり定着していますね。」\n`;
      } else {
        advice += `🌱【ミント】「平均HS率は${r.avgHs}%です。胸から首筋のラインを意識してプリエイムの高さを固定するとさらにキル率が伸びます。」\n`;
      }
      if (r.avgKd >= 1.1) {
        advice += `⚡【ライム】「平均KD ${r.avgKd}！打ち合いめちゃくちゃ強いよマスター！今の調子でガンガンファイト仕掛けてこ！」`;
      } else {
        advice += `⚡【ライム】「平均KDは ${r.avgKd}！無理な撃ち合いを減らして、味方とクロスを組んでトレードキルを狙っていこう！」`;
      }
      evalTextEl.innerHTML = advice.replace(/\n/g, '<br>');
    }

    // マップ別勝率ランキングの描画
    if (mapListEl && data.mapStats) {
      mapListEl.innerHTML = data.mapStats.map(m => {
        const winPct = m.winRate;
        const barColor = winPct >= 60 ? '#10b981' : (winPct >= 45 ? '#0ea5e9' : '#f43f5e');
        return `
          <div class="stat-row-item">
            <div class="row-info-left">
              <span class="row-title">${m.map}</span>
              <span class="row-sub">${m.total}戦 (${m.wins}勝 ${m.losses}敗) / KD: <b>${m.avgKd}</b></span>
            </div>
            <div class="row-bar-wrap">
              <div class="row-bar-fill" style="width:${winPct}%; background:${barColor};"></div>
            </div>
            <div class="row-val-right" style="color:${barColor};"><b>${winPct}%</b></div>
          </div>
        `;
      }).join('');
    }

    // エージェント別戦績の描画
    if (agentListEl && data.agentStats) {
      agentListEl.innerHTML = data.agentStats.map(a => {
        return `
          <div class="stat-row-item">
            <div class="row-agent-cell">
              <img src="${a.agentIcon || 'https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png'}" alt="${a.agent}" class="row-agent-icon" onerror="this.src='https://media.valorant-api.com/agents/add6443a-4814-3669-3280-a22cba977920/displayicon.png'" />
              <div>
                <div class="row-title">${a.agent}</div>
                <div class="row-sub">${a.total}試合 / 総キル: ${a.kills}</div>
              </div>
            </div>
            <div class="row-badges-group">
              <span class="mini-badge badge-win">勝率 ${a.winRate}%</span>
              <span class="mini-badge badge-kd">KD ${a.avgKd}</span>
            </div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('Error loading analytics:', err);
  }
}

// Canvasを使ったサイバーパンク五角形レーダーチャート描画
function drawRadarChart(stats) {
  const canvas = document.getElementById('radarChartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const centerX = w / 2;
  const centerY = h / 2 + 5;
  const maxRadius = Math.min(centerX, centerY) - 45;

  const labels = [
    { key: 'AIM', name: 'エイム精度' },
    { key: 'DAMAGE', name: 'ラウンド火力' },
    { key: 'SURVIVAL', name: '生存力' },
    { key: 'COMBAT', name: '総合戦闘力' },
    { key: 'WIN_RATE', name: '勝利貢献' }
  ];
  const numAxes = labels.length;
  const angleStep = (Math.PI * 2) / numAxes;

  // 1. 同心円・五角形グリッドの描画 (20%, 40%, 60%, 80%, 100%)
  const steps = 5;
  for (let s = 1; s <= steps; s++) {
    const r = (maxRadius / steps) * s;
    ctx.beginPath();
    for (let i = 0; i < numAxes; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = (s === steps) ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = (s === steps) ? 1.5 : 1;
    ctx.stroke();
  }

  // 2. 軸線の描画
  for (let i = 0; i < numAxes; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const x = centerX + Math.cos(angle) * maxRadius;
    const y = centerY + Math.sin(angle) * maxRadius;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ラベルの描画
    const labelDist = maxRadius + 22;
    const lx = centerX + Math.cos(angle) * labelDist;
    const ly = centerY + Math.sin(angle) * labelDist;
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labels[i].name, lx, ly);
  }

  // 3. データポリゴンの描画
  const dataPoints = labels.map(item => {
    const val = stats[item.key] || 50; // 0〜100
    return Math.min(100, Math.max(10, val));
  });

  ctx.beginPath();
  dataPoints.forEach((val, i) => {
    const r = (maxRadius * val) / 100;
    const angle = i * angleStep - Math.PI / 2;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();

  // ネオングラデーションの塗りつぶし
  const gradient = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, maxRadius);
  gradient.addColorStop(0, 'rgba(168, 85, 247, 0.55)');
  gradient.addColorStop(0.7, 'rgba(16, 185, 129, 0.35)');
  gradient.addColorStop(1, 'rgba(56, 189, 248, 0.15)');
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0; // リセット

  // データ頂点の光るポイント
  dataPoints.forEach((val, i) => {
    const r = (maxRadius * val) / 100;
    const angle = i * angleStep - Math.PI / 2;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#a855f7';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

// ========================================================
// 15. ハンズフリー音声操作（Hey Siri感覚でのトラッカー呼び出し＆潜り・飛び出し演出）
// ========================================================
let speechRecognitionInstance = null;
let isActionRunning = false;

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('SpeechRecognition is not supported in this environment.');
    const micBtn = document.getElementById('micToggleBtn');
    if (micBtn) {
      micBtn.className = 'btn-mic-toggle mic-off';
      document.getElementById('micText').textContent = '音声操作 非対応';
    }
    return;
  }

  // マイクアクセスの明示的許可要求（イヤホンマイクのストリームを開通＆Web Audio APIで波形リアルタイム連動！）
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        console.log('マイクアクセス許可OK:', stream);
        setupAudioVisualizer(stream);
      })
      .catch(err => {
        console.warn('マイクアクセス許可エラーまたは拒否:', err);
      });
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // 途中認識も受け取って感度UP！
    recognition.lang = 'ja-JP';

    recognition.onstart = () => {
      const micBtn = document.getElementById('micToggleBtn');
      if (micBtn && isSpeechRecEnabled) {
        micBtn.classList.add('mic-listening');
      }
      updateVoiceStatusMessage('🎙️ マイク待機中…声を聞いてるよ');
    };

    recognition.onresult = (event) => {
      if (!isSpeechRecEnabled || isActionRunning || isPlayingDialogue) return;

      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        transcript += event.results[i][0].transcript;
      }
      transcript = transcript.trim();
      if (!transcript) return;

      // ご要望通り、わかりやすく15文字程度でリアルタイム文字起こし表示！
      let displayTranscript = transcript;
      if (displayTranscript.length > 15) {
        displayTranscript = displayTranscript.slice(-15); // 直近15文字
      }
      updateVoiceStatusMessage(`「${displayTranscript}」`);

      // 声を検知した瞬間、イコライザー波形を活発にピコピコ跳ねさせる！
      triggerEqAnimation(true);

      // キーワード判定
      handleVoiceCommand(transcript);
    };

    recognition.onerror = (event) => {
      console.log('音声認識エラー/イベント:', event.error);
      if (event.error === 'not-allowed') {
        updateVoiceStatusMessage('⚠️ マイクアクセスが許可されていません');
        isSpeechRecEnabled = false;
        const micBtn = document.getElementById('micToggleBtn');
        if (micBtn) {
          micBtn.className = 'btn-mic-toggle mic-off';
          document.getElementById('micText').textContent = '音声操作 OFF';
        }
      } else if (event.error === 'no-speech') {
        // 音声検知なしの待機
      } else {
        updateVoiceStatusMessage(`🎙️ 音声待機中 (${event.error})`);
      }
    };

    recognition.onend = () => {
      // 途中で切れた場合も、ON状態なら少し待って自動で継続リスニング再開！
      if (isSpeechRecEnabled) {
        setTimeout(() => {
          if (isSpeechRecEnabled && speechRecognitionInstance) {
            try {
              speechRecognitionInstance.start();
            } catch (e) {}
          }
        }, 300);
      } else {
        const micBtn = document.getElementById('micToggleBtn');
        if (micBtn) micBtn.classList.remove('mic-listening');
        updateVoiceStatusMessage('音声操作 OFF');
      }
    };

    speechRecognitionInstance = recognition;
    if (isSpeechRecEnabled) {
      setTimeout(() => {
        try {
          recognition.start();
        } catch (e) {
          console.warn('Recognition start error:', e);
        }
      }, 300);
    }
  } catch (err) {
    console.warn('音声認識初期化エラー:', err);
  }
}

let statusResetTimer = null;

function updateVoiceStatusMessage(text, isTemporaryTranscript = true) {
  if (!isSpeechRecEnabled && !text.includes('OFF')) return;
  const statusMsg = document.getElementById('micStatusMsg') || document.querySelector('.app-status-bar .status-msg');
  if (statusMsg) {
    statusMsg.textContent = text;
    if (isTemporaryTranscript && text.startsWith('「')) {
      if (statusResetTimer) clearTimeout(statusResetTimer);
      statusResetTimer = setTimeout(() => {
        statusMsg.textContent = isSpeechRecEnabled ? '待機中 (声を聞いてるよ)' : 'マイク入力 OFF (停止中)';
      }, 3500);
    }
  }
}

// ========================================================
// 音楽プレイヤー風 イコライザー波形ビジュアライザー
// ========================================================
let audioVisualizerCtx = null;
let eqAnimTimeout = null;

function setupAudioVisualizer(stream) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    if (audioVisualizerCtx && audioVisualizerCtx.state !== 'closed') {
      try { audioVisualizerCtx.close(); } catch(e) {}
    }

    audioVisualizerCtx = new AudioContext();
    const source = audioVisualizerCtx.createMediaStreamSource(stream);
    const analyser = audioVisualizerCtx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const eqBars = document.querySelectorAll('#micEqualizer .eq-bar');
    const eqContainer = document.getElementById('micEqualizer');

    // 設定画面の独立マイクテストメーター要素
    const testMeterBar = document.getElementById('micTestMeterBar');
    const testLevelNum = document.getElementById('micTestLevelNum');
    const testVoiceLabel = document.getElementById('micTestVoiceLabel');

    function updateBars() {
      analyser.getByteFrequencyData(dataArray);

      // 平均音量を算出 (0〜100%スケール)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;
      const levelPercent = Math.min(100, Math.round((avg / 128) * 100));

      // 🎤 設定画面のマイクテストメーターはマイクON/OFFに関わらずリアルタイム更新！
      if (testMeterBar) {
        testMeterBar.style.width = `${levelPercent}%`;
      }
      if (testLevelNum) {
        testLevelNum.textContent = `${levelPercent}%`;
      }
      if (testVoiceLabel) {
        if (levelPercent > 18) {
          testVoiceLabel.textContent = '🔊 音声を検知中！';
          testVoiceLabel.style.color = '#34d399';
        } else {
          testVoiceLabel.textContent = '待機中 (入力なし)';
          testVoiceLabel.style.color = '#94a3b8';
        }
      }

      // サイドバーのミニイコライザー（会話入力ONの時のみアクティブ表示）
      if (isSpeechRecEnabled) {
        if (avg > 15) {
          if (eqContainer) eqContainer.classList.add('active');
          if (eqBars && eqBars.length > 0) {
            eqBars.forEach((bar, idx) => {
              const val = dataArray[idx * 3] || avg;
              const h = Math.min(18, Math.max(4, (val / 255) * 20));
              bar.style.height = `${h}px`;
            });
          }
        } else {
          if (eqContainer && !eqAnimTimeout) {
            eqContainer.classList.remove('active');
            if (eqBars) {
              eqBars.forEach(bar => { bar.style.height = '4px'; });
            }
          }
        }
      } else {
        if (eqContainer) eqContainer.classList.remove('active');
        if (eqBars) {
          eqBars.forEach(bar => { bar.style.height = '4px'; });
        }
      }

      requestAnimationFrame(updateBars);
    }

    updateBars();
  } catch (e) {
    console.warn('Audio Visualizer setup error:', e);
  }
}

function triggerEqAnimation(active) {
  if (!isSpeechRecEnabled) return;
  const eq = document.getElementById('micEqualizer');
  if (!eq) return;
  if (active) {
    eq.classList.add('active');
    if (eqAnimTimeout) clearTimeout(eqAnimTimeout);
    eqAnimTimeout = setTimeout(() => {
      eq.classList.remove('active');
      eqAnimTimeout = null;
    }, 1200);
  } else {
    eq.classList.remove('active');
  }
}

let voiceChatDebounceTimer = null;

function handleVoiceCommand(transcript) {
  const clean = transcript.replace(/[\s\u3000、。！!？?]/g, '');

  // トラッカー / サイト / コーチ / 戦績 を開く指示か？
  // 「ミントトラッカー開いて」「みんとトラッカー」「トラッカー開いて」「サイト開いて」「コーチ開いて」等
  const hasTargetObject = /(トラッカー|とらっかー|トラッカ|とらっか|tracker|サイト|さいと|戦績|せんせき|コーチ|こーち|カード)/i.test(clean);
  const hasAction = /(開いて|ひらいて|出して|だして|見せて|みせて|お願い|おねがい|オープン|開く|ひらく|あけて|開けて|スタート)/i.test(clean);
  
  // 「ミント〜」「ライム〜」と名前を呼んで何か開く指示全般（Google認識のゆらぎにも対応）
  const hasMintName = /(ミント|みんと|mint|ミン|民生|見んと|みん|水戸)/i.test(clean);
  const hasLimeName = /(ライム|らいむ|lime|らイム)/i.test(clean);

  const isTriggered = (hasTargetObject && hasAction) ||
                      /(トラッカー|とらっかー|tracker)/i.test(clean) ||
                      ((hasMintName || hasLimeName) && (hasAction || hasTargetObject));

  // ★「ミント（ライム）、トラッカー開いて！」はマイク入力OFFでも常時開ける！
  if (isTriggered) {
    if (voiceChatDebounceTimer) {
      clearTimeout(voiceChatDebounceTimer);
      voiceChatDebounceTimer = null;
    }
    console.log('★ トラッカー音声トリガー検知:', transcript);
    // ミントと呼ばれたらミント、ライムならライム。指定なしの場合はミントを優先
    let targetSpeaker = 'ai';
    if (hasLimeName && !hasMintName) {
      targetSpeaker = 'hinano';
    } else {
      targetSpeaker = 'ai';
    }
    
    // すでにチャット（トラッカー画面）が表示されており、ウィンドウが開いている場合
    const isChatActive = document.getElementById('paneChat')?.classList.contains('active-pane');
    const isDocVisible = !document.hidden;

    if (isChatActive && isDocVisible) {
      triggerAlreadyOpenMessage(targetSpeaker);
    } else {
      triggerTrackerOpenWithAnimation(targetSpeaker);
    }
    return;
  }

  // トラッカー指示以外（AIへの通常会話入力）は、マイク入力がONの時のみ送信！
  if (!isSpeechRecEnabled) return;


  // トラッカー指示以外で、2文字以上の意味のある発話なら通常会話として自動送信！
  // 話し終わった直後（スライダー設定秒数の沈黙）に落ち着いて送信するデバウンス処理
  if (clean.length >= 2 && !isPlayingDialogue && !isActionRunning) {
    if (voiceChatDebounceTimer) clearTimeout(voiceChatDebounceTimer);
    const delayMs = Math.max(1500, Math.min(10000, voiceChatDebounceSec * 1000));
    voiceChatDebounceTimer = setTimeout(() => {
      if (!isPlayingDialogue && !isActionRunning && transcript.trim()) {
        console.log(`🎙️ 音声チャット自動送信実行 (待機 ${delayMs}ms 完了):`, transcript.trim());
        sendMessage(transcript.trim());
      }
      voiceChatDebounceTimer = null;
    }, delayMs);
  }
}

// キャラクターが枠の下に「さっ」と潜り、チャットタブへ移動して下から「すっ」と出てくる！
async function triggerTrackerOpenWithAnimation(speaker = 'hinano') {
  if (isActionRunning) return;
  isActionRunning = true;

  // アイドル時のフキダシをリセット
  const bubbleMint = document.getElementById('bubbleMint');
  const bubbleLime = document.getElementById('bubbleLime');
  if (bubbleMint) bubbleMint.style.display = 'none';
  if (bubbleLime) bubbleLime.style.display = 'none';

  const isMint = (speaker === 'ai');
  const targetCard = document.getElementById(isMint ? 'aiCard' : 'hinanoCard');
  const targetImg = document.getElementById(isMint ? 'aiImg' : 'hinanoImg');
  const targetBubble = isMint ? bubbleMint : bubbleLime;

  // 1. 仕合一覧ではなく【デフォルトのチャット画面】に即座に切り替え準備
  switchTab('chat');
  appendMatchCardsToChat().catch(e => console.warn('Match cards error:', e));

  // 2. 枠の下から「すっ」と頭から肩まで浮き上がって登場！
  if (targetImg) {
    targetImg.classList.remove('dive-down');
    targetImg.classList.add('rise-up');
  }

  // 3. フキダシにテキスト表示（※音声は出さない完全消音）
  const replyText = isMint ? '「はーい！トラッカー画面を開きますね！」' : '「はーい！トラッカー開くねー！」';
  if (targetBubble) {
    targetBubble.textContent = replyText;
    targetBubble.style.display = 'block';
  }

  // 登場アニメーション完了後に通常立ち絵アニメーションへ復帰 (650ms後)
  setTimeout(() => {
    if (targetImg) {
      targetImg.classList.remove('rise-up');
    }
  }, 650);

  // 4. フキダシを維持したあと自然に消滅 (約2.8秒)
  setTimeout(() => {
    if (targetBubble) {
      targetBubble.style.display = 'none';
    }
    isActionRunning = false;
  }, 2800);
}

// すでにトラッカー画面を開いている時の反応（「もう開いてるよー！」「もう開いてますよ！」）
function triggerAlreadyOpenMessage(speaker = 'hinano') {
  if (isActionRunning) return;
  isActionRunning = true;

  const bubbleMint = document.getElementById('bubbleMint');
  const bubbleLime = document.getElementById('bubbleLime');
  if (bubbleMint) bubbleMint.style.display = 'none';
  if (bubbleLime) bubbleLime.style.display = 'none';

  const isMint = (speaker === 'ai');
  const targetBubble = isMint ? bubbleMint : bubbleLime;
  const targetImg = document.getElementById(isMint ? 'aiImg' : 'hinanoImg');

  const replyText = isMint 
    ? '「マスター、トラッカー画面はもう目の前に開いてますよ！」' 
    : '「マスター、トラッカーならもう開いてるよ〜！」';

  if (targetBubble) {
    targetBubble.textContent = replyText;
    targetBubble.style.display = 'block';
  }

  // ちょこんと小さく会釈・リアクション
  if (targetImg) {
    targetImg.style.transform = 'translateY(-8px)';
    setTimeout(() => {
      targetImg.style.transform = '';
    }, 250);
  }

  setTimeout(() => {
    if (targetBubble) {
      targetBubble.style.display = 'none';
    }
    isActionRunning = false;
  }, 2800);
}

// ========================================================
// 16. オーディオ入出力デバイス（マイク / イヤホン・スピーカー）設定
// ========================================================
let selectedAudioInputId = localStorage.getItem('selectedAudioInputId') || 'default';
let selectedAudioOutputId = localStorage.getItem('selectedAudioOutputId') || 'default';
let currentMediaStream = null;

async function refreshAudioDevices() {
  const inputSelect = document.getElementById('settingAudioInput');
  const outputSelect = document.getElementById('settingAudioOutput');
  if (!inputSelect || !outputSelect) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    inputSelect.innerHTML = '<option value="default">ブラウザ非対応 (Default)</option>';
    outputSelect.innerHTML = '<option value="default">ブラウザ非対応 (Default)</option>';
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // 現在の選択肢をクリア
    inputSelect.innerHTML = '<option value="default">既定のマイク (Default)</option>';
    outputSelect.innerHTML = '<option value="default">既定のスピーカー (Default)</option>';

    let inputCount = 1;
    let outputCount = 1;

    devices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;

      if (device.kind === 'audioinput') {
        option.textContent = device.label || `マイク ${inputCount++}`;
        if (device.deviceId === selectedAudioInputId) {
          option.selected = true;
        }
        inputSelect.appendChild(option);
      } else if (device.kind === 'audiooutput') {
        option.textContent = device.label || `スピーカー/イヤホン ${outputCount++}`;
        if (device.deviceId === selectedAudioOutputId) {
          option.selected = true;
        }
        outputSelect.appendChild(option);
      }
    });
  } catch (err) {
    console.warn('Error enumerating audio devices:', err);
  }
}

async function onAudioDeviceChanged() {
  const inputSelect = document.getElementById('settingAudioInput');
  const outputSelect = document.getElementById('settingAudioOutput');

  if (inputSelect) {
    selectedAudioInputId = inputSelect.value;
    localStorage.setItem('selectedAudioInputId', selectedAudioInputId);
  }

  if (outputSelect) {
    selectedAudioOutputId = outputSelect.value;
    localStorage.setItem('selectedAudioOutputId', selectedAudioOutputId);
    
    // ビデオやオーディオ要素が出力先変更（setSinkId）に対応している場合は適用
    const videoPreview = document.getElementById('videoPreview');
    if (videoPreview && typeof videoPreview.setSinkId === 'function') {
      try {
        await videoPreview.setSinkId(selectedAudioOutputId);
      } catch (e) {
        console.warn('setSinkId error:', e);
      }
    }
  }

  // マイク入力ストリームを新しいデバイスで再開
  await startMicrophoneStream(selectedAudioInputId);
}

async function startMicrophoneStream(deviceId = 'default') {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

  // 既存ストリームがあれば停止
  if (currentMediaStream) {
    currentMediaStream.getTracks().forEach(track => track.stop());
  }

  const audioConstraints = (deviceId && deviceId !== 'default') 
    ? { deviceId: { exact: deviceId } } 
    : true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    currentMediaStream = stream;
    console.log('新マイクストリーム接続成功 (Device:', deviceId, '):', stream);
    
    // イコライザー波形を再接続
    setupAudioVisualizer(stream);

    // デバイス名が取得できるよう一覧を再更新
    refreshAudioDevices();
  } catch (err) {
    console.warn('マイクストリーム取得エラー:', err);
  }
}

// ========================================================
// 17. バックエンド Python 音声認識ポーリング (/api/voice_event)
// （ブラウザのWebSpeechがマイクを取れない環境でもPython PyAudioから確実に検知！）
// ========================================================
let lastProcessedVoiceTimestamp = 0;

function startVoiceEventPolling() {
  setInterval(async () => {
    try {
      const res = await fetch('/api/voice_event');
      if (!res.ok) return;
      const data = await res.json();
      
      if (!data) return;

      // 15文字文字起こし表示の更新（マイク入力ON時のみ表示）
      if (isSpeechRecEnabled && data.transcript && data.timestamp > lastProcessedVoiceTimestamp) {
        let displayTranscript = data.transcript;
        if (displayTranscript.length > 15) {
          displayTranscript = displayTranscript.slice(-15);
        }
        updateVoiceStatusMessage(`「${displayTranscript}」`);
        triggerEqAnimation(true);
      }

      // コマンド判定（未処理かつ3.0秒以内の新しい音声イベント）
      const nowSec = Date.now() / 1000;
      if (data.command && data.timestamp > lastProcessedVoiceTimestamp && (nowSec - data.timestamp < 3.0)) {
        lastProcessedVoiceTimestamp = data.timestamp;
        
        // ★ トラッカー呼び出しはマイク入力OFFでも常時実行！
        if (data.command === 'mint_already_open' || data.command === 'lime_already_open') {
          const speaker = (data.command === 'mint_already_open') ? 'ai' : 'hinano';
          console.log('[Native Voice Event] Tracker is already open for:', speaker);
          triggerAlreadyOpenMessage(speaker);
        } else if (data.command === 'mint_tracker' || data.command === 'lime_tracker') {
          const speaker = (data.command === 'mint_tracker') ? 'ai' : 'hinano';
          console.log('[Native Voice Event] Triggering tracker open for:', speaker);
          triggerTrackerOpenWithAnimation(speaker);
        } else if (data.command === 'music_search_trigger') {
          console.log('[Native Voice Event] Triggering music search modal from voice command!');
          openMusicSearchModal();
          startMusicRecognition();
        } else if (data.command === 'voice_chat' && data.full_text) {
          // 通常の会話入力は、マイク入力ONの時のみ送信！
          if (isSpeechRecEnabled && !isPlayingDialogue && !isActionRunning) {
            console.log('[Native Voice Event] Voice chat recognized:', data.full_text);
            sendMessage(data.full_text);
          }
        }
      } else if (data.timestamp > lastProcessedVoiceTimestamp) {
        lastProcessedVoiceTimestamp = data.timestamp;
      }
    } catch (e) {
      // 通信エラー時は静かに無視
    }
  }, 250);
}

// 起動時に音声認識とオーディオデバイスをスタンバイ
window.addEventListener('DOMContentLoaded', () => {
  applyVoiceUIState();
  applyMicUIState();
  setTimeout(() => {
    // マイクがONの場合のみストリームと音声認識を開通（スマホで起動時に許可ダイアログが出るのを防止）
    if (isSpeechRecEnabled) {
      startMicrophoneStream(selectedAudioInputId);
      initSpeechRecognition();
    }
    refreshAudioDevices();
    startVoiceEventPolling();
  }, 800);


  // ウィンドウの可視性変更をサーバーに通知（最小化されたかどうかの判定に使用）
  document.addEventListener('visibilitychange', () => {
    fetch('/api/app_state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: !document.hidden })
    }).catch(() => {});
  });
});

// アプリ完全終了処理
function completelyExitApp() {
  if (confirm("VALORANT コーチスタジオ（ミント＆ライム）を完全に終了しますか？\n（常駐待機も終了し、音声呼び出しも停止します）")) {
    fetch('/api/exit_app').catch(() => {});
    setTimeout(() => {
      window.close();
    }, 300);
  }
}

// ========================================================
// 18. 🎵 楽曲分析 ＆ 鼻歌サーチ エンジン
// ========================================================
let currentMusicMode = 'pc'; // 'pc' | 'listen' | 'hum'
let musicMediaRecorder = null;
let musicAudioChunks = [];
let musicCountdownTimer = null;
let latestIdentifiedMusic = null;
let currentMusicStream = null;

function openMusicSearchModal() {
  const modal = document.getElementById('musicSearchModal');
  if (modal) {
    modal.style.display = 'flex';
    resetMusicSearchUI();
  }
}

function closeMusicSearchModal() {
  const modal = document.getElementById('musicSearchModal');
  if (modal) {
    modal.style.display = 'none';
    stopMusicRecordingIfActive();
  }
}

function switchMusicMode(mode) {
  currentMusicMode = mode;
  const btnPc = document.getElementById('btnMusicModePc');
  const btnListen = document.getElementById('btnMusicModeListen');
  const btnHum = document.getElementById('btnMusicModeHum');
  const assistBox = document.getElementById('hummingAssistBox');
  const statusText = document.getElementById('musicStatusText');
  const actionBtn = document.getElementById('btnStartListening');

  if (btnPc) btnPc.classList.toggle('active', mode === 'pc');
  if (btnListen) btnListen.classList.toggle('active', mode === 'listen');
  if (btnHum) btnHum.classList.toggle('active', mode === 'hum');

  if (assistBox) assistBox.style.display = (mode === 'hum') ? 'block' : 'none';

  if (mode === 'pc') {
    if (statusText) statusText.textContent = 'Discordのように画面・ウィンドウを選んで、PC内で流れている曲（YouTube/Spotify等）を最高音質で直取り・特定します！';
    if (actionBtn) actionBtn.textContent = '🖥️ 画面を選んでPCの曲を聴き取る';
  } else if (mode === 'listen') {
    if (statusText) statusText.textContent = '下のボタンを押すと、5秒間マイクで周囲の曲やスピーカーの音を聴き取ります！';
    if (actionBtn) actionBtn.textContent = '🎙️ マイクで聴き取る（5秒録音）';
  } else {
    if (statusText) statusText.textContent = '「ふふふ〜ん♪」とマイクに向かって5秒間メロディを鼻歌で歌ってください！';
    if (actionBtn) actionBtn.textContent = '🎤 鼻歌を歌う（5秒録音）';
  }
}

function resetMusicSearchUI() {
  const waveRig = document.getElementById('musicWaveRig');
  const statusText = document.getElementById('musicStatusText');
  const countdown = document.getElementById('musicCountdown');
  const resultCard = document.getElementById('musicResultCard');
  const actionBtn = document.getElementById('btnStartListening');

  if (waveRig) waveRig.classList.remove('active');
  if (countdown) countdown.style.display = 'none';
  if (resultCard) resultCard.style.display = 'none';

  switchMusicMode(currentMusicMode);
}

function stopMusicRecordingIfActive() {
  if (musicCountdownTimer) {
    clearInterval(musicCountdownTimer);
    musicCountdownTimer = null;
  }
  if (musicMediaRecorder && musicMediaRecorder.state === 'recording') {
    try {
      musicMediaRecorder.stop();
    } catch (e) {}
  }
  if (currentMusicStream && currentMusicMode === 'pc') {
    try {
      currentMusicStream.getTracks().forEach(t => t.stop());
    } catch(e) {}
    currentMusicStream = null;
  }
}

let musicSearchStepTimer = null;

function startMusicSearchAnimation() {
  const statusText = document.getElementById('musicStatusText');
  const bubbleMint = document.getElementById('bubbleMint');
  const bubbleLime = document.getElementById('bubbleLime');
  
  const steps = [
    { text: '🎧 ミントが音の波形とピッチを分析中...', bubbleM: '波形データ抽出完了...ピッチとBPMを照合します！', bubbleL: '' },
    { text: '🔍 ライムが全世界の楽曲データベースを全力スキャン中！', bubbleM: '', bubbleL: 'うおおー！これ絶対知ってる曲！ちょっと待ってね！' },
    { text: '✨ ミントが候補曲の特徴量を高精度マッチング中...', bubbleM: 'Shazam音響シグネチャ照合中...あと少しです！', bubbleL: '' },
    { text: '💬 ライムが曲の歌詞とレビューを準備中！', bubbleM: '', bubbleL: 'ビンゴ！マスターこれめっちゃいい曲じゃん！' }
  ];

  let stepIdx = 0;
  if (statusText) {
    statusText.innerHTML = `<span class="music-searching-step">${steps[0].text}</span>`;
  }
  if (bubbleMint && steps[0].bubbleM) {
    bubbleMint.textContent = steps[0].bubbleM;
    bubbleMint.style.display = 'block';
  }

  clearInterval(musicSearchStepTimer);
  musicSearchStepTimer = setInterval(() => {
    stepIdx = (stepIdx + 1) % steps.length;
    const cur = steps[stepIdx];
    if (statusText) {
      statusText.innerHTML = `<span class="music-searching-step">${cur.text}</span>`;
    }
    if (cur.bubbleM && bubbleMint) {
      bubbleMint.textContent = cur.bubbleM;
      bubbleMint.style.display = 'block';
      if (bubbleLime) bubbleLime.style.display = 'none';
      if (aiIndicator) aiIndicator.classList.add('speaking');
      if (hinanoIndicator) hinanoIndicator.classList.remove('speaking');
    } else if (cur.bubbleL && bubbleLime) {
      bubbleLime.textContent = cur.bubbleL;
      bubbleLime.style.display = 'block';
      if (bubbleMint) bubbleMint.style.display = 'none';
      if (hinanoIndicator) hinanoIndicator.classList.add('speaking');
      if (aiIndicator) aiIndicator.classList.remove('speaking');
    }
  }, 1400);
}

function stopMusicSearchAnimation() {
  if (musicSearchStepTimer) {
    clearInterval(musicSearchStepTimer);
    musicSearchStepTimer = null;
  }
  const bubbleMint = document.getElementById('bubbleMint');
  const bubbleLime = document.getElementById('bubbleLime');
  if (bubbleMint) bubbleMint.style.display = 'none';
  if (bubbleLime) bubbleLime.style.display = 'none';
  if (aiIndicator) aiIndicator.classList.remove('speaking');
  if (hinanoIndicator) hinanoIndicator.classList.remove('speaking');
}

async function startMusicRecognition() {
  const waveRig = document.getElementById('musicWaveRig');
  const statusText = document.getElementById('musicStatusText');
  const countdown = document.getElementById('musicCountdown');
  const actionBtn = document.getElementById('btnStartListening');
  const resultCard = document.getElementById('musicResultCard');

  if (resultCard) resultCard.style.display = 'none';
  if (actionBtn) {
    actionBtn.disabled = true;
    actionBtn.textContent = '🎧 聴き取り中...';
  }
  if (waveRig) waveRig.classList.add('active');

  try {
    let stream = null;

    if (currentMusicMode === 'pc') {
      if (statusText) {
        statusText.innerHTML = '🖥️ <b>画面共有ダイアログで「音声を共有」にチェックを入れて選択してください！</b>';
      }
      
      // Discordのように画面・ウィンドウ・タブ選択を開き、システム音声を直接取得
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'never', frameRate: 5 },
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false
        },
        systemAudio: 'include'
      });

      const audioTracks = displayStream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        displayStream.getTracks().forEach(t => t.stop());
        throw new Error('「システム音声を共有」のチェックが入っていませんでした。マイクから聴くか、音声共有をONにしてもう一度お試しください。');
      }

      // 音声トラックのみを抽出
      stream = new MediaStream([audioTracks[0]]);
      currentMusicStream = displayStream; // 終了時にビデオも止めるため保持

      if (statusText) {
        statusText.textContent = '🎧 PC内部の音声を高音質サンプリング中...（5秒間）';
      }
    } else {
      // マイクまたは鼻歌モード
      if (statusText) {
        statusText.textContent = (currentMusicMode === 'listen') 
          ? 'ミント＆ライムが耳を澄ましています...（音声をサンプリング中）' 
          : '鼻歌を聴き取っています...（メロディを解析中）';
      }

      let mStream = currentMediaStream;
      if (!mStream || !mStream.active || mStream.getAudioTracks().length === 0 || !mStream.getAudioTracks()[0].enabled) {
        const audioConstraints = (selectedAudioInputId && selectedAudioInputId !== 'default') 
          ? { deviceId: { exact: selectedAudioInputId } } 
          : true;
        mStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        currentMediaStream = mStream;
      }
      stream = mStream;
    }

    musicAudioChunks = [];
    musicMediaRecorder = new MediaRecorder(stream);

    musicMediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        musicAudioChunks.push(e.data);
      }
    };

    musicMediaRecorder.onstop = async () => {
      if (waveRig) waveRig.classList.remove('active');
      if (countdown) countdown.style.display = 'none';

      // 2人が一生懸命調べている演出をスタート！
      startMusicSearchAnimation();

      const audioBlob = new Blob(musicAudioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = reader.result;
        await sendAudioToIdentify(base64Audio);
      };
      reader.readAsDataURL(audioBlob);
    };

    musicMediaRecorder.start();

    // 5秒のカウントダウン
    let timeLeft = 5;
    if (countdown) {
      countdown.style.display = 'inline-block';
      countdown.textContent = `${timeLeft}s`;
    }

    musicCountdownTimer = setInterval(() => {
      timeLeft -= 1;
      if (countdown) countdown.textContent = `${timeLeft}s`;
      if (timeLeft <= 0) {
        clearInterval(musicCountdownTimer);
        musicCountdownTimer = null;
        if (musicMediaRecorder && musicMediaRecorder.state === 'recording') {
          musicMediaRecorder.stop();
        }
        if (currentMusicStream && currentMusicMode === 'pc') {
          try {
            currentMusicStream.getTracks().forEach(t => t.stop());
          } catch(e) {}
          currentMusicStream = null;
        }
      }
    }, 1000);

  } catch (err) {
    console.error('Music recording error:', err);
    stopMusicSearchAnimation();
    if (currentMusicStream && currentMusicMode === 'pc') {
      try { currentMusicStream.getTracks().forEach(t => t.stop()); } catch(e) {}
      currentMusicStream = null;
    }
    if (waveRig) waveRig.classList.remove('active');
    const msg = (err && err.message) ? err.message : String(err);
    if (statusText) statusText.textContent = `❌ 録音を開始できませんでした (${msg})`;
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.textContent = '🔄 もう一度試す';
    }
  }
}

async function sendAudioToIdentify(base64Audio) {
  const statusText = document.getElementById('musicStatusText');
  const actionBtn = document.getElementById('btnStartListening');
  const resultCard = document.getElementById('musicResultCard');

  try {
    const res = await fetch('/api/identify_music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: base64Audio })
    });

    stopMusicSearchAnimation();

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && data.found) {
      latestIdentifiedMusic = data;
      displayMusicResult(data);
    } else {
      if (statusText) {
        if (currentMusicMode === 'pc') {
          statusText.innerHTML = '😢 楽曲を特定できませんでした。<br><b>「システム音声を共有」</b>にチェックが入っているか、音量がミュートになっていないか確認してください！';
        } else if (currentMusicMode === 'listen') {
          statusText.innerHTML = '😢 楽曲を特定できませんでした。<br>スピーカーの音量を上げるか、上の「🖥️ PCの音」から画面を選んで直取りしてみてください！';
        } else {
          statusText.innerHTML = '😢 鼻歌から曲を特定できませんでした。<br>下の入力欄に歌詞やフレーズを入れて検索もできます！';
        }
      }
      if (actionBtn) {
        actionBtn.disabled = false;
        actionBtn.textContent = '🔄 もう一度聴き取る';
      }
    }
  } catch (e) {
    console.error('Identify API Error:', e);
    stopMusicSearchAnimation();
    if (statusText) statusText.textContent = '❌ 照合中にエラーが発生しました。ネットワークをご確認ください。';
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.textContent = '🎙️ もう一度試す';
    }
  }
}

async function searchMusicByText() {
  const input = document.getElementById('hummingTextInput');
  const query = input ? input.value.trim() : '';
  if (!query) return;

  const statusText = document.getElementById('musicStatusText');
  if (statusText) statusText.innerHTML = `<span class="music-searching-step">🔍 ミント＆ライムが「${query}」を解析中...</span>`;
  startMusicSearchAnimation();

  try {
    let data = null;
    try {
      const res = await fetch('/api/identify_music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: '', query: query })
      });
      if (res.ok) data = await res.json();
    } catch (e) {
      console.log('Backend music API unavailable, using client-side music search:', e);
    }

    // サーバー未接続（GitHub Pages等）時は、公式iTunes Search APIを直接検索！
    if (!data || !data.found) {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1&country=JP`;
      const iRes = await fetch(itunesUrl);
      if (iRes.ok) {
        const iJson = await iRes.json();
        if (iJson.resultCount > 0) {
          const item = iJson.results[0];
          data = {
            found: true,
            title: item.trackName,
            artist: item.artistName,
            genre: item.primaryGenreName || 'J-Pop',
            coverArt: (item.artworkUrl100 || '').replace('100x100bb', '300x300bb'),
            youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(item.artistName + ' ' + item.trackName)}`,
            lyrics: `「${item.trackName}」(${item.artistName})\n\nYouTubeリンクからフル音源・MVをご視聴いただけます！`
          };
        }
      }
    }

    stopMusicSearchAnimation();

    if (data && data.found) {
      latestIdentifiedMusic = data;
      displayMusicResult(data);
    } else {
      if (statusText) statusText.innerHTML = '😢 楽曲が見つかりませんでした。別のキーワード（曲名・アーティスト・フレーズ）でお試しください。';
    }
  } catch (e) {
    console.error('Text search error:', e);
    stopMusicSearchAnimation();
    if (statusText) statusText.textContent = '❌ 検索中にエラーが発生しました。ネットワークをご確認ください。';
  }
}

function displayMusicResult(data) {
  const statusText = document.getElementById('musicStatusText');
  const resultCard = document.getElementById('musicResultCard');
  const coverImg = document.getElementById('musicCoverArt');
  const titleEl = document.getElementById('musicTitle');
  const artistEl = document.getElementById('musicArtist');
  const genreEl = document.getElementById('musicGenre');
  const youtubeLink = document.getElementById('musicYoutubeLink');
  const actionBtn = document.getElementById('btnStartListening');

  if (statusText) statusText.innerHTML = '🎉 <b>ミントとライムが曲を見つけました！</b>';
  if (titleEl) titleEl.textContent = data.title || '不明なタイトル';
  if (artistEl) artistEl.textContent = data.artist || '不明なアーティスト';
  if (genreEl) genreEl.textContent = data.genre || 'Music';
  
  if (coverImg) {
    coverImg.src = data.coverArt || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&h=120&fit=crop';
  }
  if (youtubeLink) {
    youtubeLink.href = data.youtubeUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(data.title)}`;
  }

  // 歌詞（Lyrics）のセット
  const lyricsSection = document.getElementById('musicLyricsSection');
  const lyricsBody = document.getElementById('musicLyricsBody');
  const lyricsContent = document.getElementById('musicLyricsContent');
  const arrowEl = document.getElementById('musicLyricsToggleArrow');

  if (lyricsSection && lyricsContent) {
    let lyricsText = '';
    if (Array.isArray(data.lyrics) && data.lyrics.length > 0) {
      lyricsText = data.lyrics.join('\n');
    } else if (typeof data.lyrics === 'string' && data.lyrics.trim()) {
      lyricsText = data.lyrics;
    }

    if (lyricsText) {
      lyricsContent.textContent = lyricsText;
      lyricsSection.style.display = 'block';
      if (lyricsBody) lyricsBody.style.display = 'none'; // 初期は閉じた状態
      if (arrowEl) arrowEl.textContent = '▼';
    } else {
      lyricsSection.style.display = 'none';
    }
  }

  if (resultCard) resultCard.style.display = 'flex';
  if (actionBtn) {
    actionBtn.disabled = false;
    actionBtn.textContent = '🔄 別の曲を聴き取る';
  }
}

function toggleMusicLyrics() {
  const lyricsBody = document.getElementById('musicLyricsBody');
  const arrowEl = document.getElementById('musicLyricsToggleArrow');
  if (!lyricsBody) return;

  const isClosed = (lyricsBody.style.display === 'none' || !lyricsBody.style.display);
  if (isClosed) {
    lyricsBody.style.display = 'block';
    if (arrowEl) arrowEl.textContent = '▲';
  } else {
    lyricsBody.style.display = 'none';
    if (arrowEl) arrowEl.textContent = '▼';
  }
}

async function sendMusicToDuoChat() {
  if (!latestIdentifiedMusic) return;
  const music = latestIdentifiedMusic;
  closeMusicSearchModal();
  switchTab('chat');

  const title = music.title || 'この曲';
  const artist = music.artist || 'アーティスト';

  // ユーザーメッセージとして表示
  appendUserMessage(`🎵 今流れている曲は『${title}』(${artist})だよ！2人はこの曲どう思う？`);

  // 事前にサーバーで生成された掛け合いがあればそのまま音声・テキストで再生
  if (music.turns && music.turns.length > 0) {
    // 最初のセリフを即座に音声プリフェッチ
    music.turns.forEach(t => {
      prefetchVoice(t.text, t.speaker.toLowerCase());
    });
    await playDialogueSequence(music.turns);
  } else {
    sendMessage(`🎵 今流れている曲は『${title}』(${artist})だよ！2人はこの曲どう思う？`);
  }
}

// ==========================================
// 🚀 完全自動アップデート (GitHub Releases連携)
// ==========================================
let currentLatestUpdateData = null;

async function checkForUpdates(manual = false) {
  const statusEl = document.getElementById('updateStatusText');
  const btnEl = document.getElementById('btnCheckUpdate');
  const areaEl = document.getElementById('updateActionArea');
  const notesEl = document.getElementById('updateFoundNotes');
  const titleEl = document.getElementById('updateFoundTitle');

  if (btnEl) btnEl.disabled = true;
  if (statusEl) statusEl.textContent = '🔄 最新バージョンを確認中...';

  try {
    const res = await fetch('/api/check_update');
    const data = await res.json();
    currentLatestUpdateData = data;

    const curVerDisplay = document.getElementById('currentAppVersionDisplay');
    if (curVerDisplay && data.currentVersion) {
      curVerDisplay.textContent = `v${data.currentVersion}`;
    }

    if (data.hasUpdate) {
      if (statusEl) statusEl.textContent = `✨ 新バージョン v${data.latestVersion} が利用可能です！`;
      if (titleEl) titleEl.textContent = `🎉 新バージョン v${data.latestVersion} が見つかりました！`;
      if (notesEl) notesEl.textContent = data.releaseNotes || 'パフォーマンス向上と新機能が追加されました。';
      if (areaEl) areaEl.style.display = 'block';

      if (manual) {
        alert(`🎉 新バージョン v${data.latestVersion} が届いています！\n「今すぐ自動アップデートして再起動」を押すと、自動で最新版に化けます！`);
      }
    } else {
      if (statusEl) statusEl.textContent = `✅ 現在最新です (v${data.currentVersion || '1.1.1'})`;
      if (areaEl) areaEl.style.display = 'none';
      if (manual) {
        alert(`お使いのバージョン (v${data.currentVersion || '1.1.1'}) は最新です！✨`);
      }
    }
  } catch (err) {
    console.error('Update check error:', err);
    if (statusEl) statusEl.textContent = '❌ アップデート確認に失敗しました';
    if (manual) {
      alert('アップデート情報の取得に失敗しました。インターネット接続を確認してください。');
    }
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

async function triggerAutoUpdate() {
  if (!currentLatestUpdateData || !currentLatestUpdateData.downloadUrl) {
    alert('ダウンロードURLが取得できませんでした。');
    return;
  }

  const ok = confirm(`最新バージョン v${currentLatestUpdateData.latestVersion} に今すぐアップデートしますか？\n\n※OKを押すとゲージが進んで自動でダウンロードされ、アプリが最新版に再起動します！`);
  if (!ok) return;

  const btnRow = document.getElementById('updateBtnRow');
  const progressCard = document.getElementById('updateProgressCard');
  const stepLabel = document.getElementById('updateProgressStepLabel');
  const percentText = document.getElementById('updateProgressPercent');
  const progressBar = document.getElementById('updateProgressBar');
  const bytesText = document.getElementById('updateProgressBytes');
  const speedText = document.getElementById('updateProgressSpeed');
  const duoComment = document.getElementById('updateDuoCommentBox');

  if (btnRow) btnRow.style.display = 'none';
  if (progressCard) progressCard.style.display = 'block';

  // 開始時の音声演出
  if (duoComment) duoComment.textContent = 'ライム「アップデート開始！最新ファイルを受信中だよー！」';
  if (isVoiceEnabled && !isCoeiroinkUnavailable) {
    speakText('アップデート開始！最新ファイルを受信中だよー！', 'hinano');
  }

  // 1. バックグラウンドで更新処理をキック
  fetch('/api/apply_update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ downloadUrl: currentLatestUpdateData.downloadUrl })
  }).catch(err => console.error('Apply update trigger error:', err));

  // 2. 進行状況を200msごとにポーリング
  let hasSpokenHalf = false;
  let hasSpokenFinish = false;

  const pollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/update_progress');
      if (!res.ok) return;
      const prog = await res.json();

      const pct = prog.percent || 0;
      if (percentText) percentText.textContent = `${pct}%`;
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (bytesText) bytesText.textContent = `${prog.downloadedMB || '0.0'} MB / ${prog.totalMB || '0.0'} MB`;
      if (speedText) speedText.textContent = prog.speed || '0.0 MB/s';

      if (prog.status === 'downloading') {
        if (stepLabel) stepLabel.textContent = `📥 ダウンロード中... (${pct}%)`;

        // 50%付近でミントの合いの手
        if (pct >= 50 && !hasSpokenHalf) {
          hasSpokenHalf = true;
          if (duoComment) duoComment.textContent = 'ミント「ダウンロードは順調です。半分を通過しました。」';
          if (isVoiceEnabled && !isCoeiroinkUnavailable) {
            speakText('ダウンロードは順調です。半分を通過しました。', 'ai');
          }
        }
      } else if (prog.status === 'replacing' || prog.status === 'restarting' || pct >= 100) {
        clearInterval(pollInterval);
        if (stepLabel) stepLabel.textContent = '⚡ ファイルを最新版に置換して再起動中...';
        if (percentText) percentText.textContent = '100%';
        if (progressBar) progressBar.style.width = '100%';

        if (!hasSpokenFinish) {
          hasSpokenFinish = true;
          if (duoComment) duoComment.textContent = 'ライム「ダウンロード完了！今から最新版に切り替えて再起動するよ！」';
          if (isVoiceEnabled && !isCoeiroinkUnavailable) {
            speakText('ダウンロード完了！今から最新版に切り替えて再起動するよ！', 'hinano');
          }
        }
      } else if (prog.status === 'error') {
        clearInterval(pollInterval);
        if (stepLabel) stepLabel.textContent = '❌ アップデート中にエラーが発生しました';
        if (duoComment) duoComment.textContent = `エラー: ${prog.message || '通信エラー'}`;
        if (btnRow) btnRow.style.display = 'block';
      }
    } catch (e) {
      // 再起動でサーバーが一時ダウンした場合は完了とみなす
      clearInterval(pollInterval);
      if (stepLabel) stepLabel.textContent = '🚀 最新版で自動再起動しています...';
      if (progressBar) progressBar.style.width = '100%';
      if (percentText) percentText.textContent = '100%';
    }
  }, 250);
}

// 起動時に静かに1回アップデート確認
setTimeout(() => {
  checkForUpdates(false);
}, 3000);

// ==========================================
// 🛒 VALORANT デイリーストア & ウィッシュリスト管理
// ==========================================
let allSkinsCache = [];
let filteredSkinsList = [];
let isWishlistFilterActive = false;
let currentModalSkin = null;

// ウィッシュリスト (LocalStorage 永続化)
let wishlistSkinsSet = new Set();
try {
  const savedWishlist = localStorage.getItem('valorant_skin_wishlist');
  if (savedWishlist) {
    wishlistSkinsSet = new Set(JSON.parse(savedWishlist));
  }
} catch (e) {
  console.log('Failed to load wishlist from storage:', e);
}

function saveWishlistToStorage() {
  try {
    localStorage.setItem('valorant_skin_wishlist', JSON.stringify(Array.from(wishlistSkinsSet)));
  } catch (e) {
    console.error('Failed to save wishlist:', e);
  }
  updateWishlistSummaryUI();
}

function updateWishlistSummaryUI() {
  const countEl = document.getElementById('wishlistCount');
  const totalVpEl = document.getElementById('wishlistTotalVp');
  const totalYenEl = document.getElementById('wishlistTotalYen');
  const btnFilter = document.getElementById('btnToggleWishlistView');

  if (countEl) countEl.textContent = wishlistSkinsSet.size;

  let totalVp = 0;
  if (allSkinsCache && allSkinsCache.length > 0) {
    allSkinsCache.forEach(s => {
      if (wishlistSkinsSet.has(s.uuid)) {
        totalVp += (s.estimatedVp || 1775);
      }
    });
  }
  const totalYen = Math.round(totalVp * 1.25);

  if (totalVpEl) totalVpEl.textContent = `${totalVp.toLocaleString()} VP`;
  if (totalYenEl) totalYenEl.textContent = totalYen.toLocaleString();

  if (btnFilter) {
    btnFilter.textContent = isWishlistFilterActive ? '✕ すべて表示' : '★ 一覧表示';
    btnFilter.style.background = isWishlistFilterActive ? 'rgba(239, 68, 68, 0.25)' : '';
    btnFilter.style.color = isWishlistFilterActive ? '#f87171' : '';
  }
}

function toggleWishlistFilter() {
  isWishlistFilterActive = !isWishlistFilterActive;
  filterSkinsList();
  updateWishlistSummaryUI();
}

let dailyStoreDataCache = null;
let dailyStoreTimerInterval = null;
let dailyStoreRemainingSec = 0;

async function loadDailyStore(force = false) {
  const storeGrid = document.getElementById('dailyStoreGrid');
  if (!storeGrid) return;

  if (!force && dailyStoreDataCache) {
    renderDailyStore(dailyStoreDataCache);
    return;
  }

  storeGrid.innerHTML = `
    <div class="daily-store-loading">
      <div class="spinner"></div>
      <span>本日のデイリーショップを同期中...</span>
    </div>
  `;

  try {
    const url = force ? '/api/valorant/daily_store?force=true' : '/api/valorant/daily_store';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    dailyStoreDataCache = data;
    dailyStoreRemainingSec = data.remainingSeconds || 0;
    renderDailyStore(data);
    startDailyStoreCountdown();
  } catch (err) {
    console.error('Failed to load daily store:', err);
    storeGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:16px; color:#f87171; font-size:12px;">
        ⚠️ デイリーストアの読み込みに失敗しました (${err.message})
        <br><button onclick="loadDailyStore(true)" style="margin-top:6px; padding:4px 10px; background:#a855f7; color:#fff; border:none; border-radius:4px; cursor:pointer;">再試行</button>
      </div>
    `;
  }
}

function startDailyStoreCountdown() {
  if (dailyStoreTimerInterval) clearInterval(dailyStoreTimerInterval);

  const countdownEl = document.getElementById('dailyStoreCountdown');
  function updateTimerText() {
    if (!countdownEl) return;
    if (dailyStoreRemainingSec <= 0) {
      countdownEl.textContent = '更新時間になりました！';
      return;
    }
    const h = Math.floor(dailyStoreRemainingSec / 3600);
    const m = Math.floor((dailyStoreRemainingSec % 3600) / 60);
    const s = dailyStoreRemainingSec % 60;
    countdownEl.textContent = `${h}時間${m < 10 ? '0' + m : m}分${s < 10 ? '0' + s : s}秒`;
    dailyStoreRemainingSec--;
  }

  updateTimerText();
  dailyStoreTimerInterval = setInterval(updateTimerText, 1000);
}

function renderDailyStore(storeData) {
  const storeGrid = document.getElementById('dailyStoreGrid');
  const sourceBadge = document.getElementById('dailyStoreSourceBadge');
  const commentText = document.getElementById('dailyStoreCommentText');
  if (!storeGrid) return;

  const skins = storeData.skins || [];
  if (sourceBadge) {
    if (storeData.source === 'live') {
      sourceBadge.innerHTML = '🟢 <b>本日のデイリーストア (ゲーム内同期完了)</b>';
      sourceBadge.style.color = '#4ade80';
      sourceBadge.style.borderColor = 'rgba(74,222,128,0.5)';
      sourceBadge.style.background = 'rgba(74,222,128,0.12)';
    } else {
      sourceBadge.innerHTML = '⚠️ <b>Riot未起動 (VALORANTまたはRiot Client起動後に「🔄 更新」を押すと本物を同期します)</b>';
      sourceBadge.style.color = '#fbbf24';
      sourceBadge.style.borderColor = 'rgba(251,191,36,0.5)';
      sourceBadge.style.background = 'rgba(251,191,36,0.12)';
    }
  }

  if (skins.length === 0) {
    storeGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align:center; padding:16px; color:#94a3b8;">
        本日のストア情報はありません
      </div>
    `;
    return;
  }

  // ウィッシュリストに入っているスキンがあるか確認
  let wishedInStore = [];
  skins.forEach(s => {
    if (wishlistSkinsSet.has(s.uuid)) {
      wishedInStore.push(s);
    }
  });

  // ウォレット残高の反映
  const walletWrap = document.getElementById('dailyStoreWalletWrap');
  const walletVpVal = document.getElementById('walletVpVal');
  const walletRpVal = document.getElementById('walletRpVal');
  const walletKcVal = document.getElementById('walletKcVal');
  const wallet = storeData.wallet;

  let currentVp = 0;
  if (wallet && wallet.hasWallet) {
    currentVp = wallet.vp || 0;
    if (walletVpVal) walletVpVal.textContent = currentVp.toLocaleString();
    if (walletRpVal) walletRpVal.textContent = (wallet.rp || 0).toLocaleString();
    if (walletKcVal) walletKcVal.textContent = (wallet.kc || 0).toLocaleString();
    if (walletWrap) walletWrap.style.display = 'flex';
  } else if (walletWrap) {
    walletWrap.style.display = 'none';
  }

  // ミント＆ライムの実況コメント演出
  if (commentText) {
    if (wishedInStore.length > 0) {
      const skinNames = wishedInStore.map(s => `『${s.displayName}』`).join('・');
      if (wallet && wallet.hasWallet && currentVp >= 1775) {
        commentText.innerHTML = `🎉 <b>ライム</b>「ヤバい！マスターの狙いスキン ${skinNames} が今日来てる！しかも今の残高なら即買えるよ！買っちゃお！」`;
      } else {
        commentText.innerHTML = `🎉 <b>ライム</b>「ヤバい！マスターの狙いスキン ${skinNames} が今日ショップに来てるよ！！買い逃さないで！」`;
      }
    } else if (wallet && wallet.hasWallet) {
      commentText.innerHTML = `ミント「マスターの保有VP: <b>${currentVp.toLocaleString()} VP</b> です。本日のストアラインナップをご確認ください。」`;
    } else {
      commentText.innerHTML = `ミント「本日のデイリーストアを解析しました。ウィッシュリスト登録済みのスキンが出現した際は即座にお知らせしますね。」`;
    }
  }

  storeGrid.innerHTML = skins.map(skin => {
    const isWished = wishlistSkinsSet.has(skin.uuid);
    const vp = skin.estimatedVp || 1775;
    const tierColor = skin.tierColor || '#a855f7';

    // 所持VPで購入可能かどうかの判定バッジ
    let affordBadge = '';
    if (wallet && wallet.hasWallet) {
      if (currentVp >= vp) {
        affordBadge = `<span style="font-size:10px; color:#4ade80; background:rgba(74,222,128,0.15); border:1px solid rgba(74,222,128,0.4); border-radius:4px; padding:1px 5px; font-weight:700;">購入可能</span>`;
      } else {
        const diff = vp - currentVp;
        affordBadge = `<span style="font-size:10px; color:#f87171; background:rgba(248,113,113,0.15); border:1px solid rgba(248,113,113,0.4); border-radius:4px; padding:1px 5px;">不足: ${diff.toLocaleString()}VP</span>`;
      }
    }

    return `
      <div class="daily-store-card ${isWished ? 'wished' : ''}" onclick="openSkinDetailModal('${skin.uuid}')">
        <div class="daily-store-card-header">
          <span class="skin-tier-tag" style="background:${tierColor}20; color:${tierColor}; border:1px solid ${tierColor}50;">
            ${skin.tier}
          </span>
          <button class="skin-wish-btn ${isWished ? 'active' : ''}" title="${isWished ? 'ウィッシュリストから解除' : 'ウィッシュリストに追加'}" onclick="toggleSkinWishlistFromCard(event, '${skin.uuid}')">
            ${isWished ? '💖' : '🤍'}
          </button>
        </div>

        <div class="daily-store-img-wrap">
          <img src="${skin.displayIcon}" alt="${escapeHtml(skin.displayName)}" loading="lazy" />
        </div>

        <div class="daily-store-card-footer">
          <div class="daily-store-card-name" title="${escapeHtml(skin.displayName)}">${escapeHtml(skin.displayName)}</div>
          <div class="daily-store-card-sub">
            <span style="color:#94a3b8; font-size:11px;">${escapeHtml(skin.weapon || '')}</span>
            <div style="display:flex; align-items:center; gap:6px;">
              ${affordBadge}
              <span class="daily-store-price">
                <span style="color:#facc15;">VP</span> ${vp.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function loadSkinsCatalog(force = false) {
  // デイリーストアも同時に読み込み！
  loadDailyStore(force);
  const grid = document.getElementById('skinsGrid');
  if (!grid) return;

  if (!force && allSkinsCache && allSkinsCache.length > 0) {
    filterSkinsList();
    updateWishlistSummaryUI();
    return;
  }

  grid.innerHTML = `
    <div class="skins-loading-spinner">
      <div class="spinner"></div>
      <span>VALORANT APIからスキン図鑑を読み込み中...</span>
    </div>
  `;

  try {
    let data = null;
    try {
      const res = await fetch('/api/valorant/skins');
      if (res.ok) data = await res.json();
    } catch (e) {
      // サーバー未稼働（GitHub Pages等）時は公式APIへ直接アクセス
    }

    if (!data || data.length === 0) {
      // 1. 公式APIから全武器情報（武器種・カテゴリ対応）を取得
      const resWeapons = await fetch('https://valorant-api.com/v1/weapons?language=ja-JP');
      const wJson = await resWeapons.json();
      const weaponsList = (wJson && wJson.data) ? wJson.data : [];

      const skinToWeapon = {};
      weaponsList.forEach(w => {
        const wName = w.displayName;
        const wCat = (w.category || '').split('::').pop() || 'Other';
        (w.skins || []).forEach(s => {
          skinToWeapon[s.uuid] = { weapon: wName, category: wCat };
        });
      });

      // 2. 公式APIから全スキンリストを取得
      const resSkins = await fetch('https://valorant-api.com/v1/weapons/skins?language=ja-JP');
      const sJson = await resSkins.json();
      const skinsRaw = (sJson && sJson.data) ? sJson.data : [];

      const TIER_MAP = {
        '12683d76-48d7-84a3-4e09-6985794f0445': { name: 'Select', vp: 875, color: '#5a9fe2' },
        '0cebb8be-46d7-c12a-d306-e9907bfc5a25': { name: 'Deluxe', vp: 1275, color: '#00d692' },
        '60bca009-4182-7998-dee7-b8a2558dc369': { name: 'Premium', vp: 1775, color: '#d1548d' },
        'e046854e-406c-37f4-6607-19a9ba8426fc': { name: 'Exclusive', vp: 2175, color: '#f39c12' },
        '411e4a55-4e59-7757-41f0-86a53f101bb5': { name: 'Ultra', vp: 2475, color: '#f1c40f' }
      };

      data = [];
      skinsRaw.forEach(s => {
        const icon = s.displayIcon;
        if (!icon) return;
        const dname = s.displayName || '';
        if (dname.includes('Standard') || dname.includes('スタンダード') || dname.includes('ランダム')) return;

        const tierInfo = TIER_MAP[s.contentTierUuid] || { name: 'Edition', vp: 1775, color: '#a855f7' };
        const wInfo = skinToWeapon[s.uuid] || { weapon: 'その他', category: 'Other' };

        const chromas = (s.chromas || []).map(c => ({
          uuid: c.uuid,
          displayName: c.displayName,
          displayIcon: c.displayIcon || icon,
          fullRender: c.fullRender
        }));

        const levels = (s.levels || []).map(l => ({
          uuid: l.uuid,
          displayName: l.displayName,
          video: l.streamedVideo
        }));

        data.push({
          uuid: s.uuid,
          displayName: dname,
          weapon: wInfo.weapon,
          category: wInfo.category,
          displayIcon: icon,
          tier: tierInfo.name,
          tierColor: tierInfo.color,
          estimatedVp: tierInfo.vp,
          chromas: chromas,
          levels: levels
        });
      });
    }

    allSkinsCache = data || [];
    filterSkinsList();
    updateWishlistSummaryUI();
  } catch (err) {
    console.error('Failed to load skins:', err);
    grid.innerHTML = `
      <div class="skins-error-card">
        <div>⚠️ スキンの読み込みに失敗しました</div>
        <p>${err.message}</p>
        <button onclick="loadSkinsCatalog(true)">🔄 再試行する</button>
      </div>
    `;
  }
}

function filterSkinsList() {
  const searchInput = document.getElementById('skinSearchInput');
  const catFilter = document.getElementById('skinCategoryFilter');
  const tierFilter = document.getElementById('skinTierFilter');

  const query = (searchInput ? searchInput.value.trim().toLowerCase() : '');
  const selectedCat = (catFilter ? catFilter.value : 'ALL');
  const selectedTier = (tierFilter ? tierFilter.value : 'ALL');

  filteredSkinsList = allSkinsCache.filter(skin => {
    // ウィッシュリストフィルター
    if (isWishlistFilterActive && !wishlistSkinsSet.has(skin.uuid)) {
      return false;
    }

    // 検索語
    if (query) {
      const matchName = skin.displayName && skin.displayName.toLowerCase().includes(query);
      const matchWeapon = skin.weapon && skin.weapon.toLowerCase().includes(query);
      if (!matchName && !matchWeapon) return false;
    }

    // 武器種
    if (selectedCat !== 'ALL') {
      if (skin.category !== selectedCat) return false;
    }

    // ティア
    if (selectedTier !== 'ALL') {
      if (skin.tier !== selectedTier) return false;
    }

    return true;
  });

  renderSkinsGrid(filteredSkinsList);
}

function clearSkinSearch() {
  const searchInput = document.getElementById('skinSearchInput');
  if (searchInput) {
    searchInput.value = '';
    filterSkinsList();
  }
}

function toggleWishlistFilter() {
  isWishlistFilterActive = !isWishlistFilterActive;
  filterSkinsList();
  updateWishlistSummaryUI();
}

function renderSkinsGrid(skins) {
  const grid = document.getElementById('skinsGrid');
  if (!grid) return;

  if (!skins || skins.length === 0) {
    grid.innerHTML = `
      <div class="skins-empty-card">
        <div style="font-size:32px; margin-bottom:8px;">🔍</div>
        <div style="font-weight:700; color:#fff;">該当するスキンが見つかりませんでした</div>
        <p style="font-size:12px; color:#94a3b8; margin-top:4px;">検索条件や武器フィルターを変更してみてください。</p>
      </div>
    `;
    return;
  }

  const countLabel = document.getElementById('skinsCatalogCountLabel');
  if (countLabel) {
    countLabel.textContent = `(全 ${allSkinsCache ? allSkinsCache.length : 0} 種中 ${skins.length} 件表示)`;
  }

  // 表示件数が多い時のレンダリング負荷軽減のため最大150件表示
  const displayList = skins.slice(0, 150);

  grid.innerHTML = displayList.map(skin => {
    const isWished = wishlistSkinsSet.has(skin.uuid);
    const vp = skin.estimatedVp || 1775;
    const yen = Math.round(vp * 1.25);
    const tierColor = skin.tierColor || '#a855f7';

    return `
      <div class="skin-card ${isWished ? 'wished' : ''}" onclick="openSkinDetailModal('${skin.uuid}')">
        <div class="skin-card-header">
          <span class="skin-tier-tag" style="background:${tierColor}20; color:${tierColor}; border:1px solid ${tierColor}50;">
            ${skin.tier}
          </span>
          <button class="skin-wish-btn ${isWished ? 'active' : ''}" title="${isWished ? 'ウィッシュリストから解除' : 'ウィッシュリストに追加'}" onclick="toggleSkinWishlistFromCard(event, '${skin.uuid}')">
            ${isWished ? '💖' : '🤍'}
          </button>
        </div>

        <div class="skin-card-img-wrap">
          <img src="${skin.displayIcon}" alt="${escapeHtml(skin.displayName)}" loading="lazy" />
        </div>

        <div class="skin-card-footer">
          <div class="skin-card-title">${escapeHtml(skin.displayName)}</div>
          <div class="skin-card-sub">
            <span class="skin-weapon-name">${escapeHtml(skin.weapon || '')}</span>
            <span class="skin-price-tag">${vp.toLocaleString()} VP</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function toggleSkinWishlistFromCard(event, skinUuid) {
  event.stopPropagation();
  if (wishlistSkinsSet.has(skinUuid)) {
    wishlistSkinsSet.delete(skinUuid);
  } else {
    wishlistSkinsSet.add(skinUuid);
  }
  saveWishlistToStorage();
  filterSkinsList();
}

function openSkinDetailModal(skinUuid) {
  const skin = allSkinsCache.find(s => s.uuid === skinUuid);
  if (!skin) return;

  currentModalSkin = skin;
  const modal = document.getElementById('skinDetailModal');
  const nameEl = document.getElementById('skinModalName');
  const badgeEl = document.getElementById('skinModalTierBadge');
  const previewImg = document.getElementById('skinModalPreviewImg');
  const previewVideo = document.getElementById('skinModalVideo');
  const chromasRow = document.getElementById('skinModalChromasRow');
  const levelsRow = document.getElementById('skinModalLevelsRow');
  const vpEl = document.getElementById('skinModalVp');
  const yenEl = document.getElementById('skinModalYen');
  const btnWish = document.getElementById('btnSkinWishlistToggle');

  if (nameEl) nameEl.textContent = skin.displayName;
  if (badgeEl) {
    badgeEl.textContent = skin.tier;
    badgeEl.style.color = skin.tierColor || '#38bdf8';
    badgeEl.style.borderColor = (skin.tierColor || '#38bdf8') + '60';
  }

  // 初期プレビュー画像
  if (previewImg) {
    previewImg.src = skin.displayIcon;
    previewImg.style.display = 'block';
  }
  if (previewVideo) {
    previewVideo.pause();
    previewVideo.style.display = 'none';
    previewVideo.src = '';
  }

  // 価格情報
  const vp = skin.estimatedVp || 1775;
  const yen = Math.round(vp * 1.25);
  if (vpEl) vpEl.textContent = `${vp.toLocaleString()} VP`;
  if (yenEl) yenEl.textContent = `(約 ${yen.toLocaleString()} 円)`;

  // ウィッシュリストボタン状態
  updateModalWishlistBtn();

  // クロマ一覧
  if (chromasRow) {
    if (skin.chromas && skin.chromas.length > 0) {
      chromasRow.innerHTML = skin.chromas.map((c, i) => {
        const cIcon = c.displayIcon || skin.displayIcon;
        return `
          <div class="chroma-chip ${i === 0 ? 'active' : ''}" onclick="selectSkinChroma(${i}, this)" title="${escapeHtml(c.displayName || 'デフォルト')}">
            <img src="${cIcon}" alt="Chroma" />
            <span>${escapeHtml(c.displayName ? c.displayName.split('\n')[0] : `色 ${i+1}`)}</span>
          </div>
        `;
      }).join('');
    } else {
      chromasRow.innerHTML = '<div style="font-size:12px; color:#64748b;">カラーバリエーションはありません</div>';
    }
  }

  // レベル・フィニッシャー動画一覧
  if (levelsRow) {
    const validLevels = (skin.levels || []).filter(l => l.video);
    if (validLevels.length > 0) {
      levelsRow.innerHTML = validLevels.map((l, i) => {
        return `
          <button class="level-video-btn" onclick="playSkinLevelVideo('${l.video}', this)">
            ▶️ ${escapeHtml(l.displayName || `Level ${i+1}`)}
          </button>
        `;
      }).join('');
      document.getElementById('skinLevelsSection').style.display = 'block';
    } else {
      document.getElementById('skinLevelsSection').style.display = 'none';
    }
  }

  if (modal) modal.style.display = 'flex';
}

function closeSkinDetailModal() {
  const modal = document.getElementById('skinDetailModal');
  const previewVideo = document.getElementById('skinModalVideo');
  if (previewVideo) {
    previewVideo.pause();
    previewVideo.src = '';
  }
  if (modal) modal.style.display = 'none';
  currentModalSkin = null;
}

function selectSkinChroma(index, chipEl) {
  if (!currentModalSkin || !currentModalSkin.chromas) return;
  const chroma = currentModalSkin.chromas[index];
  if (!chroma) return;

  document.querySelectorAll('.chroma-chip').forEach(c => c.classList.remove('active'));
  if (chipEl) chipEl.classList.add('active');

  const previewImg = document.getElementById('skinModalPreviewImg');
  const previewVideo = document.getElementById('skinModalVideo');

  if (previewVideo) {
    previewVideo.pause();
    previewVideo.style.display = 'none';
  }
  if (previewImg) {
    previewImg.src = chroma.fullRender || chroma.displayIcon || currentModalSkin.displayIcon;
    previewImg.style.display = 'block';
  }
}

function playSkinLevelVideo(videoUrl, btnEl) {
  const previewImg = document.getElementById('skinModalPreviewImg');
  const previewVideo = document.getElementById('skinModalVideo');

  document.querySelectorAll('.level-video-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  if (previewImg) previewImg.style.display = 'none';
  if (previewVideo) {
    previewVideo.src = videoUrl;
    previewVideo.style.display = 'block';
    previewVideo.play().catch(e => console.log('Video auto-play blocked:', e));
  }
}

function updateModalWishlistBtn() {
  const btnWish = document.getElementById('btnSkinWishlistToggle');
  if (!btnWish || !currentModalSkin) return;

  const isWished = wishlistSkinsSet.has(currentModalSkin.uuid);
  if (isWished) {
    btnWish.textContent = '💔 ウィッシュリストから解除';
    btnWish.style.background = 'rgba(239,68,68,0.2)';
    btnWish.style.borderColor = 'rgba(239,68,68,0.5)';
    btnWish.style.color = '#f87171';
  } else {
    btnWish.textContent = '💖 ウィッシュリストに追加';
    btnWish.style.background = 'linear-gradient(135deg, #ec4899, #f43f5e)';
    btnWish.style.borderColor = 'transparent';
    btnWish.style.color = '#fff';
  }
}

function toggleCurrentSkinWishlist() {
  if (!currentModalSkin) return;
  if (wishlistSkinsSet.has(currentModalSkin.uuid)) {
    wishlistSkinsSet.delete(currentModalSkin.uuid);
  } else {
    wishlistSkinsSet.add(currentModalSkin.uuid);
  }
  saveWishlistToStorage();
  updateModalWishlistBtn();
  filterSkinsList();
}

function askDuoAboutThisSkin() {
  if (!currentModalSkin) return;
  const skin = currentModalSkin;
  closeSkinDetailModal();
  switchTab('chat');

  const question = `${skin.displayName} (${skin.weapon} / ${skin.tier}) ってスキン、どう思う？買う価値あるかな？`;
  appendUserMessage(question);

  // 2人に相談
  handleDuoChatInput(question);
}

function askDuoForSkinAdvice() {
  switchTab('chat');
  const count = wishlistSkinsSet.size;
  const question = count > 0 
    ? `ウィッシュリストに${count}個スキン入ってるんだけど、一番優先して買うべきおすすめスキン教えて！` 
    : `VALORANTで絶対後悔しない神スキンってどれ？ミントとライムのおすすめ教えて！`;
  appendUserMessage(question);
  handleDuoChatInput(question);
}


// ==========================================
// 🎲 パーティツール (ダイス・エージェント抽選・マップBAN)
// ==========================================
let cachedPartyToolsData = null;
let currentAgentFilterRole = 'ALL';
let bannedMapUuids = new Set();

async function loadPartyToolsData() {
  try {
    const res = await fetch('/api/valorant/party_tools');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    cachedPartyToolsData = await res.json();
    renderMapsBanGrid();
  } catch (err) {
    console.error('Failed to load party tools data:', err);
  }
}

// 1. 1〜100 ダイス（サイコロ）
function rollDice100() {
  const resultBox = document.getElementById('diceResultBox');
  const commentBox = document.getElementById('diceCommentBox');
  if (!resultBox) return;

  // コロボロ転がるアニメーション
  let counter = 0;
  const interval = setInterval(() => {
    resultBox.textContent = Math.floor(Math.random() * 100) + 1;
    counter++;
    if (counter > 15) {
      clearInterval(interval);
      const finalNumber = Math.floor(Math.random() * 100) + 1;
      resultBox.textContent = finalNumber;

      // ミントとライムのリアクション＆音声
      let dialogue = [];
      if (finalNumber === 100) {
        dialogue = [
          { speaker: 'hinano', text: `うおおおっ！？100出たーーー！神引きすぎ！今日無敵じゃん！` },
          { speaker: 'ai', text: `100点満点、素晴らしいです！この運を味方にランクも連勝を掴みましょう！` }
        ];
      } else if (finalNumber >= 80) {
        dialogue = [
          { speaker: 'hinano', text: `${finalNumber}！めっちゃ高い！今日のエイム超キレキレなんじゃない！？` },
          { speaker: 'ai', text: `高スコアですね。自信を持ってアグレッシブに勝負していきましょう。` }
        ];
      } else if (finalNumber <= 10) {
        dialogue = [
          { speaker: 'hinano', text: `えっ…${finalNumber}！？ちょ、これはダイスが悪い！もう1回振っていいよ！` },
          { speaker: 'ai', text: `不運をここで使い切ったと考えましょう。実力でカバーすれば問題ありません！` }
        ];
      } else {
        dialogue = [
          { speaker: 'hinano', text: `${finalNumber}！いい感じの数字だね！この調子でガンガンいこー！` },
          { speaker: 'ai', text: `出目は${finalNumber}です。堅実なプレイを心掛ければ勝利できますよ。` }
        ];
      }

      if (commentBox) {
        commentBox.textContent = `${dialogue[0].speaker === 'hinano' ? 'ライム' : 'ミント'}「${dialogue[0].text}」`;
      }

      // ボイス再生
      if (isVoiceEnabled && !isCoeiroinkUnavailable) {
        speakText(dialogue[0].text, dialogue[0].speaker);
      }
    }
  }, 40);
}

// 2. エージェントランダム抽選
function setAgentFilter(role, pillEl) {
  currentAgentFilterRole = role;
  document.querySelectorAll('.role-pill').forEach(p => p.classList.remove('active'));
  if (pillEl) pillEl.classList.add('active');
}

function spinAgentRoulette() {
  if (!cachedPartyToolsData || !cachedPartyToolsData.agents) return;

  let candidates = cachedPartyToolsData.agents;
  if (currentAgentFilterRole !== 'ALL') {
    candidates = candidates.filter(a => a.role === currentAgentFilterRole);
  }

  if (candidates.length === 0) return;

  const portraitEl = document.getElementById('agentRouletteImg');
  const nameEl = document.getElementById('agentRouletteName');
  const roleEl = document.getElementById('agentRouletteRole');
  const commentEl = document.getElementById('agentRouletteComment');

  let counter = 0;
  const interval = setInterval(() => {
    const tempAgent = candidates[Math.floor(Math.random() * candidates.length)];
    if (portraitEl) portraitEl.src = tempAgent.displayIcon;
    if (nameEl) nameEl.textContent = tempAgent.displayName;
    if (roleEl) roleEl.textContent = tempAgent.role;
    counter++;

    if (counter > 16) {
      clearInterval(interval);
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      if (portraitEl) portraitEl.src = chosen.displayIcon;
      if (nameEl) nameEl.textContent = chosen.displayName;
      if (roleEl) roleEl.textContent = chosen.role;

      // エージェントごとのセリフ演出
      const limeComments = [
        `よっしゃ！${chosen.displayName}きたー！今日のキャリーよろしくね！`,
        `${chosen.displayName}で行こう！スキル使いまくって敵ボコボコにしちゃお！`,
        `おっ、${chosen.displayName}！マスターのキル集量産タイム突入だね！`
      ];
      const mintComments = [
        `選出されたのは${chosen.displayName}です。チーム構成とのシナジーを活かしましょう。`,
        `${chosen.displayName}ですね。エリアコントロールを意識すると非常に強力です。`,
        `${chosen.displayName}で行きましょう。アビリティのタイミングが勝利の鍵です。`
      ];

      const isLime = Math.random() > 0.5;
      const speaker = isLime ? 'hinano' : 'ai';
      const text = isLime 
        ? limeComments[Math.floor(Math.random() * limeComments.length)]
        : mintComments[Math.floor(Math.random() * mintComments.length)];

      if (commentEl) {
        commentEl.textContent = `${isLime ? 'ライム' : 'ミント'}「${text}」`;
      }

      if (isVoiceEnabled && !isCoeiroinkUnavailable) {
        speakText(text, speaker);
      }
    }
  }, 50);
}

// 3. マップルーレット ＆ BAN機能
function renderMapsBanGrid() {
  const grid = document.getElementById('mapsBanGrid');
  if (!grid || !cachedPartyToolsData || !cachedPartyToolsData.maps) return;

  grid.innerHTML = cachedPartyToolsData.maps.map(map => {
    const isBanned = bannedMapUuids.has(map.uuid);
    return `
      <div class="map-ban-chip ${isBanned ? 'banned' : ''}" onclick="toggleMapBan('${map.uuid}')" title="クリックしてBAN/解除">
        <img src="${map.listViewIcon || map.splash}" alt="${escapeHtml(map.displayName)}" />
        <div class="map-chip-name">${escapeHtml(map.displayName)}</div>
        <div class="map-ban-badge">${isBanned ? '🚫 BAN' : 'OK'}</div>
      </div>
    `;
  }).join('');
}

function toggleMapBan(mapUuid) {
  if (bannedMapUuids.has(mapUuid)) {
    bannedMapUuids.delete(mapUuid);
  } else {
    // 全てBANされるのを防止
    if (cachedPartyToolsData && cachedPartyToolsData.maps) {
      if (bannedMapUuids.size >= cachedPartyToolsData.maps.length - 1) {
        alert('最低1つのマップを残してください！');
        return;
      }
    }
    bannedMapUuids.add(mapUuid);
  }
  renderMapsBanGrid();
}

function resetMapBanList() {
  bannedMapUuids.clear();
  renderMapsBanGrid();
  const banner = document.getElementById('mapResultBanner');
  if (banner) banner.style.display = 'none';
}

function spinMapRoulette() {
  if (!cachedPartyToolsData || !cachedPartyToolsData.maps) return;

  const validMaps = cachedPartyToolsData.maps.filter(m => !bannedMapUuids.has(m.uuid));
  if (validMaps.length === 0) {
    alert('抽選可能なマップがありません！BANを解除してください。');
    return;
  }

  const banner = document.getElementById('mapResultBanner');
  const bannerImg = document.getElementById('mapResultImg');
  const bannerName = document.getElementById('mapResultName');

  if (banner) banner.style.display = 'block';

  let counter = 0;
  const interval = setInterval(() => {
    const tempMap = validMaps[Math.floor(Math.random() * validMaps.length)];
    if (bannerImg) bannerImg.src = tempMap.splash;
    if (bannerName) bannerName.textContent = tempMap.displayName;
    counter++;

    if (counter > 15) {
      clearInterval(interval);
      const chosenMap = validMaps[Math.floor(Math.random() * validMaps.length)];
      if (bannerImg) bannerImg.src = chosenMap.splash;
      if (bannerName) bannerName.textContent = chosenMap.displayName;

      const dialogue = Math.random() > 0.5 
        ? { speaker: 'hinano', text: `戦場は【${chosenMap.displayName}】に決定！ガンガン詰めていこー！` }
        : { speaker: 'ai', text: `抽選の結果、【${chosenMap.displayName}】に決まりました。セットアップを確認しましょう。` };

      if (isVoiceEnabled && !isCoeiroinkUnavailable) {
        speakText(dialogue.text, dialogue.speaker);
      }
    }
  }, 60);
}

// ============================================================
// 🕹️ Game Dev Studio (プランA: ゲーム制作モード) 実装
// ============================================================
let currentGameDevCode = '';
let isGameDevInitialized = false;

const GAME_DEV_PRESETS = {
  aim: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>VALO Aim Trainer</title>
<style>
  body { margin: 0; background: #0b0f19; color: #fff; font-family: sans-serif; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; }
  #hud { position: absolute; top: 16px; left: 24px; font-size: 16px; font-weight: bold; text-shadow: 0 0 8px #00f0ff; }
  canvas { border: 2px solid #00f0ff; border-radius: 8px; box-shadow: 0 0 24px rgba(0,240,255,0.3); background: radial-gradient(circle, #1a2236 0%, #080c14 100%); cursor: crosshair; }
  #msg { position: absolute; bottom: 20px; font-size: 13px; color: #94a3b8; }
</style>
</head>
<body>
<div id="hud">SCORE: <span id="scoreVal" style="color:#00f0ff">0</span> | TIME: <span id="timerVal" style="color:#f43f5e">30</span>s</div>
<canvas id="gameCanvas" width="760" height="460"></canvas>
<div id="msg">ターゲット（赤・シアン）を素早くクリックしてエイムを鍛えよう！</div>
<script>
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let score = 0;
let timeLeft = 30;
let targets = [];
let particles = [];
let gameOver = false;

class Target {
  constructor() {
    this.r = Math.random() * 14 + 16;
    this.x = Math.random() * (canvas.width - this.r * 2) + this.r;
    this.y = Math.random() * (canvas.height - this.r * 2) + this.r;
    this.color = Math.random() > 0.3 ? '#f43f5e' : '#00f0ff';
    this.spawnTime = Date.now();
    this.life = 2000;
  }
  draw() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  }
}

function spawnTarget() {
  if (targets.length < 5 && !gameOver) {
    targets.push(new Target());
  }
}

canvas.addEventListener('mousedown', (e) => {
  if (gameOver) {
    score = 0;
    timeLeft = 30;
    targets = [];
    particles = [];
    gameOver = false;
    document.getElementById('scoreVal').textContent = score;
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  let hit = false;
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    const dist = Math.hypot(mx - t.x, my - t.y);
    if (dist <= t.r) {
      hit = true;
      score += 100;
      document.getElementById('scoreVal').textContent = score;
      for (let p = 0; p < 12; p++) {
        particles.push({
          x: t.x, y: t.y,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8,
          alpha: 1,
          color: t.color
        });
      }
      targets.splice(i, 1);
      break;
    }
  }
});

setInterval(() => {
  if (!gameOver) spawnTarget();
}, 600);

setInterval(() => {
  if (!gameOver && timeLeft > 0) {
    timeLeft--;
    document.getElementById('timerVal').textContent = timeLeft;
    if (timeLeft <= 0) gameOver = true;
  }
}, 1000);

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  targets.forEach(t => t.draw());

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.04;
    if (p.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 4, 4);
    ctx.restore();
  }

  if (gameOver) {
    ctx.save();
    ctx.fillStyle = 'rgba(11, 15, 25, 0.85)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH! SCORE: ' + score, canvas.width / 2, canvas.height / 2 - 10);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '16px sans-serif';
    ctx.fillText('クリックしてもう一度挑戦！', canvas.width / 2, canvas.height / 2 + 30);
    ctx.restore();
  }

  requestAnimationFrame(loop);
}
loop();
<\\/script>
</body>
</html>`.replace('<\\/script>', '</script>'),

  shooter: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Retro Cyber Shooter</title>
<style>
  body { margin: 0; background: #030712; color: #fff; font-family: monospace; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
  canvas { border: 2px solid #a855f7; border-radius: 8px; box-shadow: 0 0 20px rgba(168,85,247,0.4); background: #080811; }
  #hud { position: absolute; top: 16px; font-size: 16px; color: #a855f7; font-weight: bold; }
</style>
</head>
<body>
<div id="hud">SCORE: <span id="sc">0</span> | LIVES: <span id="lv">3</span></div>
<canvas id="cv" width="600" height="500"></canvas>
<script>
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let score = 0, lives = 3, over = false;
let p = { x: 280, y: 440, w: 32, h: 20, spd: 6 };
let bullets = [], enemies = [], stars = [];
let keys = {};

for(let i=0; i<60; i++) stars.push({ x: Math.random()*cv.width, y: Math.random()*cv.height, spd: Math.random()*2+1 });

window.onkeydown = e => { keys[e.code] = true; if(e.code==='Space'&&!over) bullets.push({x: p.x+14, y: p.y, vy: -9}); };
window.onkeyup = e => { keys[e.code] = false; };

function spawn() {
  if(!over && Math.random()<0.04) {
    enemies.push({ x: Math.random()*(cv.width-30), y: -20, w: 26, h: 22, vy: Math.random()*2+2, hp: 1 });
  }
}

function update() {
  if(!over) {
    if(keys['ArrowLeft'] || keys['KeyA']) p.x = Math.max(0, p.x - p.spd);
    if(keys['ArrowRight'] || keys['KeyD']) p.x = Math.min(cv.width - p.w, p.x + p.spd);

    bullets.forEach((b, bi) => {
      b.y += b.vy;
      if(b.y < -10) bullets.splice(bi, 1);
    });

    enemies.forEach((e, ei) => {
      e.y += e.vy;
      bullets.forEach((b, bi) => {
        if(b.x > e.x && b.x < e.x+e.w && b.y > e.y && b.y < e.y+e.h) {
          enemies.splice(ei, 1);
          bullets.splice(bi, 1);
          score += 150;
          document.getElementById('sc').textContent = score;
        }
      });
      if(e.y > cv.height) {
        enemies.splice(ei, 1);
        lives--;
        document.getElementById('lv').textContent = lives;
        if(lives <= 0) over = true;
      }
    });
    spawn();
  }
}

function draw() {
  ctx.fillStyle = '#080811';
  ctx.fillRect(0, 0, cv.width, cv.height);

  ctx.fillStyle = '#64748b';
  stars.forEach(s => {
    s.y += s.spd; if(s.y > cv.height) s.y = 0;
    ctx.fillRect(s.x, s.y, 2, 2);
  });

  // Player
  ctx.fillStyle = '#38bdf8';
  ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 10;
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.shadowBlur = 0;

  // Bullets
  ctx.fillStyle = '#f43f5e';
  bullets.forEach(b => ctx.fillRect(b.x, b.y, 4, 10));

  // Enemies
  ctx.fillStyle = '#a855f7';
  enemies.forEach(e => {
    ctx.fillRect(e.x, e.y, e.w, e.h);
  });

  if(over) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0,0,cv.width,cv.height);
    ctx.fillStyle = '#ef4444';
    ctx.font = '28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MISSION FAILED', cv.width/2, cv.height/2);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('クリックして再挑戦', cv.width/2, cv.height/2 + 35);
  }
}

cv.onclick = () => {
  if(over) {
    score = 0; lives = 3; over = false;
    enemies = []; bullets = [];
    document.getElementById('sc').textContent = score;
    document.getElementById('lv').textContent = lives;
  }
};

function loop() { update(); draw(); requestAnimationFrame(loop); }
loop();
<\\/script>
</body>
</html>`.replace('<\\/script>', '</script>'),

  breakout: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Neon Breakout</title>
<style>
  body { margin: 0; background: #0f172a; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; color: #fff; }
  canvas { border: 2px solid #10b981; border-radius: 8px; box-shadow: 0 0 20px rgba(16,185,129,0.3); background: #020617; }
</style>
</head>
<body>
<canvas id="bcv" width="600" height="420"></canvas>
<script>
const c = document.getElementById('bcv');
const ctx = c.getContext('2d');
let ball = { x: 300, y: 350, dx: 3.5, dy: -3.5, r: 7 };
let paddle = { x: 250, w: 100, h: 12, speed: 7 };
let rightPressed = false, leftPressed = false;
let score = 0, lives = 3;

let brickRows = 4, brickCols = 8, bW = 60, bH = 18, bPad = 10, bOffTop = 40, bOffLeft = 25;
let bricks = [];
function initBricks() {
  bricks = [];
  for(let r=0; r<brickRows; r++) {
    bricks[r] = [];
    for(let cl=0; cl<brickCols; cl++) bricks[r][cl] = { x: 0, y: 0, status: 1 };
  }
}
initBricks();

document.addEventListener('keydown', e => { if(e.key==='Right'||e.key==='ArrowRight'||e.key==='d') rightPressed = true; if(e.key==='Left'||e.key==='ArrowLeft'||e.key==='a') leftPressed = true; });
document.addEventListener('keyup', e => { if(e.key==='Right'||e.key==='ArrowRight'||e.key==='d') rightPressed = false; if(e.key==='Left'||e.key==='ArrowLeft'||e.key==='a') leftPressed = false; });
document.addEventListener('mousemove', e => {
  const rect = c.getBoundingClientRect();
  const relX = e.clientX - rect.left;
  if(relX > 0 && relX < c.width) paddle.x = relX - paddle.w/2;
});

function draw() {
  ctx.clearRect(0, 0, c.width, c.height);

  // Bricks
  for(let r=0; r<brickRows; r++) {
    for(let cl=0; cl<brickCols; cl++) {
      if(bricks[r][cl].status === 1) {
        let bx = (cl*(bW+bPad))+bOffLeft;
        let by = (r*(bH+bPad))+bOffTop;
        bricks[r][cl].x = bx;
        bricks[r][cl].y = by;
        ctx.fillStyle = r%2===0 ? '#10b981' : '#06b6d4';
        ctx.fillRect(bx, by, bW, bH);
      }
    }
  }

  // Ball
  ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
  ctx.fillStyle = '#facc15'; ctx.fill(); ctx.closePath();

  // Paddle
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(paddle.x, c.height-paddle.h-10, paddle.w, paddle.h);

  // Score
  ctx.font = '14px sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText('SCORE: ' + score + '  LIVES: ' + lives, 25, 25);

  // Collision
  for(let r=0; r<brickRows; r++) {
    for(let cl=0; cl<brickCols; cl++) {
      let b = bricks[r][cl];
      if(b.status === 1) {
        if(ball.x > b.x && ball.x < b.x+bW && ball.y > b.y && ball.y < b.y+bH) {
          ball.dy = -ball.dy;
          b.status = 0;
          score += 10;
        }
      }
    }
  }

  if(ball.x + ball.dx > c.width-ball.r || ball.x + ball.dx < ball.r) ball.dx = -ball.dx;
  if(ball.y + ball.dy < ball.r) ball.dy = -ball.dy;
  else if(ball.y + ball.dy > c.height-paddle.h-10-ball.r) {
    if(ball.x > paddle.x && ball.x < paddle.x + paddle.w) {
      ball.dy = -ball.dy;
    } else if(ball.y + ball.dy > c.height-ball.r) {
      lives--;
      if(!lives) {
        alert('GAME OVER! SCORE: ' + score);
        document.location.reload();
      } else {
        ball.x = 300; ball.y = 350; ball.dx = 3.5; ball.dy = -3.5;
        paddle.x = 250;
      }
    }
  }

  if(rightPressed && paddle.x < c.width-paddle.w) paddle.x += paddle.speed;
  else if(leftPressed && paddle.x > 0) paddle.x -= paddle.speed;

  ball.x += ball.dx; ball.y += ball.dy;
  requestAnimationFrame(draw);
}
draw();
<\\/script>
</body>
</html>`.replace('<\\/script>', '</script>'),

  jump: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Cyber Jumper</title>
<style>
  body { margin: 0; background: #0a0a14; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: monospace; color: #fff; }
  canvas { border: 2px solid #e11d48; border-radius: 8px; box-shadow: 0 0 20px rgba(225,29,72,0.4); background: #13111c; }
</style>
</head>
<body>
<canvas id="jcv" width="600" height="380"></canvas>
<script>
const c = document.getElementById('jcv');
const ctx = c.getContext('2d');
let player = { x: 80, y: 280, w: 28, h: 36, vy: 0, jump: -12, onGround: true };
let obstacles = [];
let score = 0, over = false;

window.onkeydown = e => {
  if((e.code==='Space'||e.code==='ArrowUp') && player.onGround && !over) {
    player.vy = player.jump;
    player.onGround = false;
  }
};
c.onclick = () => {
  if(over) { over = false; score = 0; obstacles = []; player.y = 280; player.vy = 0; }
  else if(player.onGround) { player.vy = player.jump; player.onGround = false; }
};

function loop() {
  ctx.clearRect(0,0,c.width,c.height);

  // Ground
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 316, c.width, 64);

  if(!over) {
    score++;
    player.vy += 0.7; // gravity
    player.y += player.vy;
    if(player.y >= 280) { player.y = 280; player.vy = 0; player.onGround = true; }

    if(Math.random()<0.02 && (obstacles.length===0 || obstacles[obstacles.length-1].x < c.width - 200)) {
      obstacles.push({ x: c.width, y: 286, w: 22, h: 30, spd: 5 + Math.floor(score/600) });
    }

    obstacles.forEach((ob, idx) => {
      ob.x -= ob.spd;
      if(ob.x < -30) obstacles.splice(idx, 1);
      // Collision
      if(player.x < ob.x+ob.w && player.x+player.w > ob.x && player.y < ob.y+ob.h && player.y+player.h > ob.y) {
        over = true;
      }
    });
  }

  // Draw Player
  ctx.fillStyle = '#06b6d4';
  ctx.fillRect(player.x, player.y, player.w, player.h);

  // Draw Obstacles
  ctx.fillStyle = '#e11d48';
  obstacles.forEach(ob => ctx.fillRect(ob.x, ob.y, ob.w, ob.h));

  ctx.fillStyle = '#fff';
  ctx.font = '16px monospace';
  ctx.fillText('SCORE: ' + score, 20, 30);

  if(over) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle = '#e11d48';
    ctx.font = '28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CRASHED! SCORE: ' + score, c.width/2, c.height/2);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText('クリックしてリトライ', c.width/2, c.height/2+35);
  }

  requestAnimationFrame(loop);
}
loop();
<\\/script>
</body>
</html>`.replace('<\\/script>', '</script>'),

  clicker: `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Radianite Clicker</title>
<style>
  body { margin: 0; background: #0b132b; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; user-select: none; }
  #core { width: 140px; height: 140px; border-radius: 50%; background: radial-gradient(circle, #38bdf8 0%, #1e40af 100%); display: flex; align-items: center; justify-content: center; font-size: 40px; cursor: pointer; box-shadow: 0 0 35px rgba(56,189,248,0.6); transition: transform 0.1s; }
  #core:active { transform: scale(0.92); }
  .stats { font-size: 22px; font-weight: bold; margin-bottom: 20px; color: #38bdf8; text-shadow: 0 0 10px rgba(56,189,248,0.5); }
  .upgrades { display: flex; gap: 12px; margin-top: 30px; }
  .btn-up { background: rgba(255,255,255,0.08); border: 1px solid #38bdf8; color: #fff; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .btn-up:hover { background: rgba(56,189,248,0.2); }
</style>
</head>
<body>
<div class="stats">💎 <span id="rVal">0</span> Radianite</div>
<div id="core">⚡</div>
<div class="upgrades">
  <button class="btn-up" onclick="buyAuto()">自動抽出ドローン (Cost: <span id="cAuto">25</span>)</button>
  <button class="btn-up" onclick="buyClick()">クリック出力+1 (Cost: <span id="cClick">50</span>)</button>
</div>
<script>
let r = 0, perClick = 1, auto = 0, costAuto = 25, costClick = 50;
const rEl = document.getElementById('rVal');
const cAutoEl = document.getElementById('cAuto');
const cClickEl = document.getElementById('cClick');

document.getElementById('core').onclick = () => {
  r += perClick;
  rEl.textContent = r;
};

function buyAuto() {
  if(r >= costAuto) {
    r -= costAuto;
    auto++;
    costAuto = Math.floor(costAuto * 1.5);
    rEl.textContent = r;
    cAutoEl.textContent = costAuto;
  }
}

function buyClick() {
  if(r >= costClick) {
    r -= costClick;
    perClick += 2;
    costClick = Math.floor(costClick * 1.8);
    rEl.textContent = r;
    cClickEl.textContent = costClick;
  }
}

setInterval(() => {
  if(auto > 0) {
    r += auto;
    rEl.textContent = r;
  }
}, 1000);
<\\/script>
</body>
</html>`.replace('<\\/script>', '</script>')
};

function initGameDevStudio() {
  if (isGameDevInitialized) return;
  isGameDevInitialized = true;
  // 初期はエイム練習ゲームをロード
  applyGamePreset('aim');
}

function applyGamePreset(presetKey) {
  const code = GAME_DEV_PRESETS[presetKey];
  if (!code) return;
  currentGameDevCode = code;
  renderGameInSandbox(code);

  const presetNames = {
    aim: 'VALO エイム練習',
    shooter: 'サイバーシューティング',
    breakout: 'ネオンブロック崩し',
    jump: 'ジャンプアクション',
    clicker: 'レディアナイトクリッカー'
  };

  appendGameDevDuoMessage(
    `ミント: プリセット【${presetNames[presetKey]}】をロードしました。HTML5 Canvasによる描画ループと入力リスナーで構成されています。何を追加または調整しますか？`,
    `ライム: ロード完了っ！色を変えたり、演出をハデにしたり、必殺技を入れたり何でも言ってね！`
  );
}

function renderGameInSandbox(htmlCode) {
  const frame = document.getElementById('gameSandboxFrame');
  const codeViewer = document.getElementById('gameSourceCodeViewer');
  if (frame) {
    frame.srcdoc = htmlCode;
  }
  if (codeViewer) {
    codeViewer.value = htmlCode;
  }
}

async function submitGameDevInstruction() {
  const inputEl = document.getElementById('gameDevInstructionInput');
  const statusEl = document.getElementById('gameDevPreviewStatus');
  if (!inputEl) return;
  const promptText = inputEl.value.trim();
  if (!promptText) return;

  // ユーザーメッセージを追加
  appendGameDevUserMessage(promptText);
  inputEl.value = '';

  if (statusEl) {
    statusEl.innerHTML = '<span style="color:#00f0ff;">⚡ ミントとライムがゲームをコーディング中...</span>';
  }

  try {
    const res = await fetch('/api/game_dev/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction: promptText,
        current_code: currentGameDevCode
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.html) {
      currentGameDevCode = data.html;
      renderGameInSandbox(data.html);
      if (statusEl) statusEl.innerHTML = '<span style="color:#10b981;">● ゲーム稼働中 (実行OK)</span>';
    } else {
      if (statusEl) statusEl.innerHTML = '<span style="color:#f43f5e;">⚠️ 生成コードの受信に失敗しました</span>';
    }

    appendGameDevDuoMessage(
      `ミント: ${data.mint_comment || 'ご指示通りにコードを調整・更新しました。動作をご確認ください。'}`,
      `ライム: ${data.lime_comment || 'できたよー！右の画面で早速遊んでみて！感想教えてね！'}`
    );

    // 音声読み上げ（オンなら）
    if (isVoiceEnabled && !isCoeiroinkUnavailable) {
      if (data.mint_comment) speakText(data.mint_comment, 'ai');
      if (data.lime_comment) setTimeout(() => speakText(data.lime_comment, 'hinano'), 2500);
    }
  } catch (err) {
    console.error('Game Dev Error:', err);
    if (statusEl) statusEl.innerHTML = '<span style="color:#f43f5e;">エラーが発生しました</span>';
    appendGameDevDuoMessage(
      'ミント: 申し訳ありません、サーバーとの通信に一時的な問題が発生しました。',
      'ライム: うーん、もう一回送ってみてくれる？'
    );
  }
}

function appendGameDevUserMessage(text) {
  const history = document.getElementById('gameDevHistory');
  if (!history) return;
  const div = document.createElement('div');
  div.className = 'gamedev-msg user';
  div.textContent = text;
  history.appendChild(div);
  history.scrollTop = history.scrollHeight;
}

function appendGameDevDuoMessage(mintText, limeText) {
  const history = document.getElementById('gameDevHistory');
  if (!history) return;
  const div = document.createElement('div');
  div.className = 'gamedev-msg ai-duo';
  div.innerHTML = `
    <div class="ai-duo-mint">🌱 ${mintText}</div>
    <div class="ai-duo-lime">⚡ ${limeText}</div>
  `;
  history.appendChild(div);
  history.scrollTop = history.scrollHeight;
}

function reloadGameSandbox() {
  if (currentGameDevCode) {
    renderGameInSandbox(currentGameDevCode);
  }
}

function toggleGameFullscreen() {
  const frameWrap = document.querySelector('.gamedev-frame-wrap');
  if (!frameWrap) return;
  if (!document.fullscreenElement) {
    frameWrap.requestFullscreen().catch(err => alert(`全画面表示エラー: ${err.message}`));
  } else {
    document.exitFullscreen();
  }
}

function toggleGameCodeViewer() {
  const modal = document.getElementById('gameCodeViewerModal');
  if (!modal) return;
  modal.classList.toggle('active');
}

function copyGameDevCode() {
  const codeViewer = document.getElementById('gameSourceCodeViewer');
  if (!codeViewer || !codeViewer.value) return;
  navigator.clipboard.writeText(codeViewer.value).then(() => {
    alert('ゲームのHTML/JSコードをクリップボードにコピーしました！');
  }).catch(() => {
    alert('コピーに失敗しました');
  });
}

function exportCurrentGameHtml() {
  if (!currentGameDevCode) {
    alert('エクスポートするゲームコードがありません');
    return;
  }
  const blob = new Blob([currentGameDevCode], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `MintLime_Game_${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}



