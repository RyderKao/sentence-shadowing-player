(() => {
  "use strict";

  const state = {
    mode: "youtube",
    sourceCues: [],
    translationCues: [],
    sentences: [],
    currentIndex: 0,
    loopTarget: 1,
    loopCount: 0,
    sentenceStopTime: null,
    isSentencePlayback: false,
    youtubePlayer: null,
    youtubeReady: false,
    pendingYoutubeId: null,
    audioObjectUrl: null,
    timer: null
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    youtubeTab: $("youtubeTab"),
    audioTab: $("audioTab"),
    youtubeSetup: $("youtubeSetup"),
    audioSetup: $("audioSetup"),
    youtubeUrl: $("youtubeUrl"),
    loadYoutubeBtn: $("loadYoutubeBtn"),
    audioFile: $("audioFile"),
    sourceSubtitle: $("sourceSubtitle"),
    translationSubtitle: $("translationSubtitle"),
    processBtn: $("processBtn"),
    demoBtn: $("demoBtn"),
    status: $("status"),
    playerSection: $("playerSection"),
    youtubePlayer: $("youtubePlayer"),
    audioPlayer: $("audioPlayer"),
    sentenceCounter: $("sentenceCounter"),
    sentenceSlider: $("sentenceSlider"),
    sourceText: $("sourceText"),
    translationText: $("translationText"),
    timeText: $("timeText"),
    prevBtn: $("prevBtn"),
    playSentenceBtn: $("playSentenceBtn"),
    nextBtn: $("nextBtn"),
    speedSelect: $("speedSelect"),
    loopSelect: $("loopSelect"),
    autoNextCheckbox: $("autoNextCheckbox"),
    searchInput: $("searchInput"),
    sentenceList: $("sentenceList")
  };

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle("error", isError);
  }

  function setMode(mode) {
    state.mode = mode;
    const isYoutube = mode === "youtube";
    els.youtubeTab.classList.toggle("active", isYoutube);
    els.audioTab.classList.toggle("active", !isYoutube);
    els.youtubeSetup.classList.toggle("hidden", !isYoutube);
    els.audioSetup.classList.toggle("hidden", isYoutube);
    if (!els.playerSection.classList.contains("hidden")) {
      updateMediaVisibility();
    }
  }

  function updateMediaVisibility() {
    const youtubeIframe = document.querySelector("#youtubePlayer iframe");
    const youtubeHost = $("youtubePlayer");
    if (state.mode === "youtube") {
      youtubeHost.classList.remove("hidden");
      els.audioPlayer.classList.add("hidden");
    } else {
      youtubeHost.classList.add("hidden");
      els.audioPlayer.classList.remove("hidden");
    }
  }

  function parseTimecode(value) {
    const normalized = value.trim().replace(",", ".");
    const parts = normalized.split(":").map(Number);
    if (parts.some(Number.isNaN)) return null;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0];
  }

  function cleanCueText(text) {
    return text
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\{\\[^}]+\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseSrtOrVtt(raw) {
    const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = text.split("\n");
    const cues = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line || line === "WEBVTT" || line.startsWith("NOTE")) {
        i += 1;
        continue;
      }

      let timingLine = line;
      if (!timingLine.includes("-->") && i + 1 < lines.length && lines[i + 1].includes("-->")) {
        i += 1;
        timingLine = lines[i].trim();
      }

      if (!timingLine.includes("-->")) {
        i += 1;
        continue;
      }

      const [startPart, endPartRaw] = timingLine.split("-->");
      const endPart = endPartRaw.trim().split(/\s+/)[0];
      const start = parseTimecode(startPart);
      const end = parseTimecode(endPart);
      i += 1;

      const textLines = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i]);
        i += 1;
      }

      const cueText = cleanCueText(textLines.join(" "));
      if (start !== null && end !== null && end > start && cueText) {
        const previous = cues[cues.length - 1];
        if (
          previous &&
          previous.text === cueText &&
          Math.abs(previous.end - start) < 0.15
        ) {
          previous.end = end;
        } else {
          cues.push({ start, end, text: cueText });
        }
      }
    }

    if (!cues.length) throw new Error("字幕解析失敗，請確認檔案為有效的 SRT 或 VTT。");
    return cues;
  }

  function sentenceLooksComplete(text) {
    return /[.!?。！？…]["'»”’)]?$/.test(text.trim());
  }

  function mergeCuesIntoSentences(cues) {
    const result = [];
    let current = null;

    for (const cue of cues) {
      if (!current) {
        current = { ...cue };
        continue;
      }

      const gap = cue.start - current.end;
      const combinedText = `${current.text} ${cue.text}`.replace(/\s+/g, " ").trim();
      const combinedDuration = cue.end - current.start;
      const shouldBreak =
        sentenceLooksComplete(current.text) ||
        gap > 0.9 ||
        combinedDuration > 12 ||
        combinedText.length > 180;

      if (shouldBreak) {
        result.push(current);
        current = { ...cue };
      } else {
        current.text = combinedText;
        current.end = cue.end;
      }
    }

    if (current) result.push(current);
    return result;
  }

  function findTranslation(sentence, index) {
    if (!state.translationCues.length) return "";

    const midpoint = (sentence.start + sentence.end) / 2;
    let best = null;
    let bestScore = Infinity;

    for (const cue of state.translationCues) {
      const overlaps = cue.start <= sentence.end && cue.end >= sentence.start;
      const cueMidpoint = (cue.start + cue.end) / 2;
      const score = Math.abs(cueMidpoint - midpoint) + (overlaps ? 0 : 5);
      if (score < bestScore) {
        best = cue;
        bestScore = score;
      }
    }

    if (best && bestScore < 8) return best.text;
    return state.translationCues[index]?.text || "";
  }

  function buildSentences() {
    const merged = mergeCuesIntoSentences(state.sourceCues);
    state.sentences = merged.map((sentence, index) => ({
      id: index + 1,
      ...sentence,
      translation: findTranslation(sentence, index)
    }));
  }

  function formatTime(seconds) {
    const totalMs = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    const hh = hours ? `${String(hours).padStart(2, "0")}:` : "";
    return `${hh}${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  }

  function renderCurrentSentence(scrollIntoView = true) {
    if (!state.sentences.length) return;
    const sentence = state.sentences[state.currentIndex];

    els.sentenceCounter.textContent = `${state.currentIndex + 1} / ${state.sentences.length}`;
    els.sentenceSlider.max = String(state.sentences.length - 1);
    els.sentenceSlider.value = String(state.currentIndex);
    els.sourceText.textContent = sentence.text;
    els.translationText.textContent = sentence.translation || "尚未提供中文字幕。";
    els.timeText.textContent = `${formatTime(sentence.start)} – ${formatTime(sentence.end)}`;
    els.prevBtn.disabled = state.currentIndex === 0;
    els.nextBtn.disabled = state.currentIndex === state.sentences.length - 1;

    document.querySelectorAll(".sentence-item").forEach((item) => {
      item.classList.toggle("active", Number(item.dataset.index) === state.currentIndex);
    });

    if (scrollIntoView) {
      const active = document.querySelector(`.sentence-item[data-index="${state.currentIndex}"]`);
      active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function renderSentenceList(filter = "") {
    const keyword = filter.trim().toLowerCase();
    els.sentenceList.innerHTML = "";

    state.sentences.forEach((sentence, index) => {
      const haystack = `${sentence.text} ${sentence.translation || ""}`.toLowerCase();
      if (keyword && !haystack.includes(keyword)) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "sentence-item";
      button.dataset.index = String(index);
      button.innerHTML = `
        <span class="index">${index + 1}</span>
        <span>
          <span class="item-source"></span>
          <span class="item-translation"></span>
        </span>`;
      button.querySelector(".item-source").textContent = sentence.text;
      button.querySelector(".item-translation").textContent = sentence.translation || "—";
      button.addEventListener("click", () => {
        stopPlayback();
        state.currentIndex = index;
        renderCurrentSentence();
      });
      els.sentenceList.appendChild(button);
    });

    renderCurrentSentence(false);
  }

  function extractYoutubeId(input) {
    const value = input.trim();
    if (/^[\w-]{11}$/.test(value)) return value;
    try {
      const url = new URL(value);
      if (url.hostname.includes("youtu.be")) return url.pathname.slice(1).split("/")[0];
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2];
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2];
      return url.searchParams.get("v");
    } catch {
      return null;
    }
  }

  function loadYoutube() {
    const id = extractYoutubeId(els.youtubeUrl.value);
    if (!id) {
      setStatus("無法辨識 YouTube URL。", true);
      return false;
    }

    state.pendingYoutubeId = id;

    if (state.youtubePlayer && state.youtubeReady) {
      state.youtubePlayer.cueVideoById(id);
      setStatus("YouTube 影片已載入。接著選擇字幕檔。");
      return true;
    }

    if (window.YT && window.YT.Player) {
      createYoutubePlayer(id);
    } else {
      setStatus("正在等待 YouTube Player API 載入…");
    }
    return true;
  }

  function createYoutubePlayer(videoId) {
    if (state.youtubePlayer) return;
    state.youtubePlayer = new YT.Player("youtubePlayer", {
      width: "100%",
      height: "420",
      videoId,
      playerVars: {
        playsinline: 1,
        rel: 0,
        modestbranding: 1
      },
      events: {
        onReady: () => {
          state.youtubeReady = true;
          state.youtubePlayer.setPlaybackRate(Number(els.speedSelect.value));
          if (state.pendingYoutubeId) state.youtubePlayer.cueVideoById(state.pendingYoutubeId);
          setStatus("YouTube 播放器已準備完成。");
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
            if (!state.isSentencePlayback) els.playSentenceBtn.textContent = "▶ 播放本句";
          }
        },
        onError: () => setStatus("YouTube 影片無法嵌入，可能被影片擁有者限制。", true)
      }
    });
  }

  window.onYouTubeIframeAPIReady = () => {
    if (state.pendingYoutubeId) createYoutubePlayer(state.pendingYoutubeId);
  };

  function stopPlayback() {
    state.isSentencePlayback = false;
    state.sentenceStopTime = null;
    state.loopCount = 0;
    els.playSentenceBtn.textContent = "▶ 播放本句";
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
    if (state.mode === "audio") {
      els.audioPlayer.pause();
    } else if (state.youtubePlayer && state.youtubeReady) {
      state.youtubePlayer.pauseVideo();
    }
  }

  function getCurrentTime() {
    if (state.mode === "audio") return els.audioPlayer.currentTime || 0;
    if (state.youtubePlayer && state.youtubeReady) return state.youtubePlayer.getCurrentTime() || 0;
    return 0;
  }

  function seekAndPlay(start) {
    const speed = Number(els.speedSelect.value);
    if (state.mode === "audio") {
      if (!els.audioPlayer.src) throw new Error("請先載入本機音檔。");
      els.audioPlayer.currentTime = start;
      els.audioPlayer.playbackRate = speed;
      return els.audioPlayer.play();
    }

    if (!state.youtubePlayer || !state.youtubeReady) {
      throw new Error("YouTube 播放器尚未準備完成。");
    }
    state.youtubePlayer.setPlaybackRate(speed);
    state.youtubePlayer.seekTo(start, true);
    state.youtubePlayer.playVideo();
    return Promise.resolve();
  }

  async function playCurrentSentence() {
    if (!state.sentences.length) return;
    stopPlayback();

    const sentence = state.sentences[state.currentIndex];
    state.loopTarget = els.loopSelect.value === "infinite"
      ? Infinity
      : Number(els.loopSelect.value);
    state.loopCount = 0;
    state.sentenceStopTime = sentence.end;
    state.isSentencePlayback = true;
    els.playSentenceBtn.textContent = "■ 停止";

    try {
      await seekAndPlay(sentence.start);
    } catch (error) {
      stopPlayback();
      setStatus(error.message, true);
      return;
    }

    state.timer = setInterval(async () => {
      if (!state.isSentencePlayback) return;
      const now = getCurrentTime();

      if (now >= state.sentenceStopTime - 0.03) {
        state.loopCount += 1;

        if (state.loopCount < state.loopTarget) {
          try {
            await seekAndPlay(sentence.start);
          } catch (error) {
            stopPlayback();
            setStatus(error.message, true);
          }
          return;
        }

        stopPlayback();

        if (els.autoNextCheckbox.checked && state.currentIndex < state.sentences.length - 1) {
          state.currentIndex += 1;
          renderCurrentSentence(false);
          setTimeout(playCurrentSentence, 180);
        }
      }
    }, 40);
  }

  async function readFile(file) {
    if (!file) return "";
    return await file.text();
  }

  async function processInputs() {
    try {
      if (state.mode === "youtube") {
        if (!extractYoutubeId(els.youtubeUrl.value)) {
          throw new Error("請輸入有效的 YouTube URL。");
        }
        loadYoutube();
      } else {
        const file = els.audioFile.files[0];
        if (!file) throw new Error("請選擇 MP3、M4A 或 WAV 音檔。");
        if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
        state.audioObjectUrl = URL.createObjectURL(file);
        els.audioPlayer.src = state.audioObjectUrl;
      }

      const sourceFile = els.sourceSubtitle.files[0];
      if (!sourceFile) throw new Error("請選擇原文 SRT 或 VTT 字幕。");

      setStatus("正在解析字幕…");
      state.sourceCues = parseSrtOrVtt(await readFile(sourceFile));

      const translationFile = els.translationSubtitle.files[0];
      state.translationCues = translationFile
        ? parseSrtOrVtt(await readFile(translationFile))
        : [];

      buildSentences();
      if (!state.sentences.length) throw new Error("沒有可播放的字幕句子。");

      state.currentIndex = 0;
      els.playerSection.classList.remove("hidden");
      updateMediaVisibility();
      renderSentenceList();
      renderCurrentSentence();
      setStatus(`完成：已建立 ${state.sentences.length} 個句子。`);
      els.playerSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(error.message || "處理失敗。", true);
    }
  }

  function loadDemo() {
    state.sourceCues = [
      { start: 0.6, end: 2.8, text: "Hola, amigos." },
      { start: 3.0, end: 6.4, text: "Bienvenidos al episodio de hoy." },
      { start: 6.8, end: 10.8, text: "Andrea nos dijo que tendríamos una actividad secreta." },
      { start: 11.0, end: 14.8, text: "Por supuesto, no quería perdérmela." }
    ];
    state.translationCues = [
      { start: 0.6, end: 2.8, text: "朋友們，大家好。" },
      { start: 3.0, end: 6.4, text: "歡迎收聽今天這一集。" },
      { start: 6.8, end: 10.8, text: "Andrea 告訴我們，我們將會有一個祕密活動。" },
      { start: 11.0, end: 14.8, text: "當然，我不想錯過它。" }
    ];
    buildSentences();
    state.currentIndex = 0;
    els.playerSection.classList.remove("hidden");
    updateMediaVisibility();
    renderSentenceList();
    renderCurrentSentence();
    setStatus("已載入示範字幕。要實際播放，仍需載入 YouTube 或本機音檔。");
  }

  els.youtubeTab.addEventListener("click", () => setMode("youtube"));
  els.audioTab.addEventListener("click", () => setMode("audio"));
  els.loadYoutubeBtn.addEventListener("click", loadYoutube);
  els.processBtn.addEventListener("click", processInputs);
  els.demoBtn.addEventListener("click", loadDemo);

  els.playSentenceBtn.addEventListener("click", () => {
    if (state.isSentencePlayback) stopPlayback();
    else playCurrentSentence();
  });

  els.prevBtn.addEventListener("click", () => {
    if (state.currentIndex <= 0) return;
    stopPlayback();
    state.currentIndex -= 1;
    renderCurrentSentence(false);
  });

  els.nextBtn.addEventListener("click", () => {
    if (state.currentIndex >= state.sentences.length - 1) return;
    stopPlayback();
    state.currentIndex += 1;
    renderCurrentSentence(false);
  });

  els.sentenceSlider.addEventListener("input", () => {
    stopPlayback();
    state.currentIndex = Number(els.sentenceSlider.value);
    renderCurrentSentence(false);
  });

  els.speedSelect.addEventListener("change", () => {
    const speed = Number(els.speedSelect.value);
    els.audioPlayer.playbackRate = speed;
    if (state.youtubePlayer && state.youtubeReady) {
      const available = state.youtubePlayer.getAvailablePlaybackRates?.() || [];
      if (!available.length || available.includes(speed)) {
        state.youtubePlayer.setPlaybackRate(speed);
      } else {
        setStatus(`此 YouTube 影片不支援 ${speed}×，播放器會使用最接近的速度。`);
      }
    }
  });

  els.searchInput.addEventListener("input", () => renderSentenceList(els.searchInput.value));

  document.addEventListener("keydown", (event) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (event.key === "ArrowLeft") els.prevBtn.click();
    if (event.key === "ArrowRight") els.nextBtn.click();
    if (event.code === "Space") {
      event.preventDefault();
      els.playSentenceBtn.click();
    }
  });

  setMode("youtube");
})();