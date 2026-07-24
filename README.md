# Sentence Shadowing Player

一個不需要安裝套件的單頁網頁工具，支援：

- YouTube URL + SRT/VTT
- 本機 MP3/M4A/WAV + SRT/VTT
- 可選中文字幕 SRT/VTT
- 上一句、播放本句、下一句
- 單句循環
- 播放速度
- 自動播放下一句
- 搜尋字幕

## 最簡單執行方式

### macOS / Linux

1. 解壓縮資料夾。
2. 在 Terminal 進入資料夾：

```bash
cd sentence_shadowing_player
```

3. 啟動本機伺服器：

```bash
python3 -m http.server 8000
```

4. 瀏覽器開啟：

```text
http://localhost:8000
```

### Windows

1. 解壓縮資料夾。
2. 在該資料夾的位址列輸入 `cmd` 後按 Enter。
3. 執行：

```bat
py -m http.server 8000
```

4. 瀏覽器開啟：

```text
http://localhost:8000
```

## 手機使用

電腦與 iPhone 必須在同一個 Wi-Fi。

1. 在電腦查區域網路 IP，例如 `192.168.1.23`。
2. 伺服器保持運行。
3. iPhone Safari 開啟：

```text
http://192.168.1.23:8000
```

## 使用流程

### YouTube 模式

1. 貼上 YouTube URL。
2. 按「載入影片」。
3. 選擇原文 `.srt` 或 `.vtt`。
4. 可選擇中文字幕 `.srt` 或 `.vtt`。
5. 按「建立逐句播放器」。

注意：某些 YouTube 影片禁止嵌入，因此無法在工具內播放。

### 本機音檔模式

1. 切換到「本機音檔」。
2. 選擇 MP3、M4A 或 WAV。
3. 選擇原文字幕。
4. 可選擇中文字幕。
5. 按「建立逐句播放器」。

所有本機音檔均只在瀏覽器中讀取，不會上傳。

## 字幕格式

SRT 範例：

```srt
1
00:00:01,200 --> 00:00:03,500
Hola, ¿cómo estás?

2
00:00:03,800 --> 00:00:06,100
Muy bien, gracias.
```

## 限制

- 本版本不會只靠 YouTube URL 自動下載字幕。
- 本版本不會自動翻譯；中文翻譯需以第二個字幕檔提供。
- YouTube 速度選項受 YouTube Player API 支援範圍限制。
- 字幕會依標點、停頓與長度做簡單合併，未使用語言模型。
