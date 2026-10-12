<script lang="ts">
  import { onMount } from 'svelte';
  import {
    formatDuration,
    getElapsedMs,
    isRunningState,
    localDateKey,
    type RunningState,
  } from '../lib/stopwatch';
  import {
    deleteFavorite,
    deleteResultHistory,
    deleteStopwatchRecord,
    importBackupData,
    listFavorites,
    listResultHistory,
    listStopwatchRecords,
    recordResultAction,
    saveFavorite,
    saveStopwatchRecord,
    type FavoriteItem,
    type ResultHistoryItem,
    type StopwatchRecord,
  } from '../lib/storage';
  import Icon from './Icon.svelte';
  import { syncWithCloud } from '../lib/sync';
  import { buildConversionResults, converterSources, sourceForUrl } from '../lib/converter-sources';

  type Section = 'converter' | 'history' | 'favorites' | 'stopwatch' | 'settings';
  type Theme = 'dark' | 'light' | 'system';
  const navigation: { id: Section; label: string; icon: string; hint: string }[] = [
    { id: 'converter', label: '編號轉換', icon: 'arrow-up-right', hint: 'Converter' },
    { id: 'history', label: '歷史紀錄', icon: 'history', hint: 'History' },
    { id: 'favorites', label: '我的收藏', icon: 'star', hint: 'Favorites' },
    { id: 'stopwatch', label: '碼錶', icon: 'timer', hint: 'Stopwatch' },
    { id: 'settings', label: '設定', icon: 'settings', hint: 'Settings' },
  ];

  let activeSection: Section = 'converter';
  let theme: Theme = 'system';
  let now = Date.now();
  let tick: ReturnType<typeof setInterval> | undefined;
  let runningState: RunningState | null = null;
  let records: StopwatchRecord[] = [];
  let resultHistory: ResultHistoryItem[] = [];
  let favorites: FavoriteItem[] = [];
  let favoriteTitle = '';
  let favoriteUrl = '';
  let favoriteNotes = '';
  let favoriteQuery = '';
  let favoriteSort: 'newest' | 'oldest' | 'title' | 'updated' = 'newest';
  let editingFavoriteId: string | null = null;
  let storageError = '';
  let notice = '';
  let recordQuery = '';
  let recordSort: 'newest' | 'oldest' | 'longest' | 'shortest' = 'newest';
  let resultQuery = '';
  let resultSort: 'newest' | 'oldest' = 'newest';
  let converterInput = '';
  let converterSite = 'AUTO';
  let converterOutput = '';
  let converterUrl = '';
  let converterUrls: string[] = [];
  let converterResults: { key: string; label: string; url: string }[] = [];

  function updateConverterOutput() {
    converterResults = buildConversionResults(converterInput, converterSite);
    converterUrls = converterResults.map((result) => result.url);
    converterUrl = converterUrls[0] ?? '';
    converterOutput = converterUrls.join('\n');
  }
  function clearConverter() {
    converterInput = '';
    converterOutput = '';
    converterUrl = '';
    converterUrls = [];
    converterResults = [];
    notice = '';
  }

  async function pasteConverterInput() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        notice = '剪貼簿目前沒有文字。';
        return;
      }
      converterInput = text.trim().toLowerCase();
      updateConverterOutput();
      notice = '已貼上剪貼簿內容。';
    } catch {
      notice = '無法讀取剪貼簿，請確認瀏覽器權限後再試。';
    }
  }

  function randomConverter() {
    converterInput = String(Math.floor(Math.random() * 900000) + 100000);
    updateConverterOutput();
  }

  async function copyConverterOutput() {
    if (!converterOutput) return;
    try {
      await navigator.clipboard.writeText(converterOutput);
      for (const result of converterResults) await logResultAction(result, 'copy');
      notice = '已複製並記錄轉換結果。';
    } catch {
      notice = '無法存取剪貼簿，請手動複製結果。';
    }
  }

  async function shareConverterOutput() {
    if (!converterOutput) return;
    const shareText = converterOutput;
    try {
      if (navigator.share) { await navigator.share({ text: shareText }); for (const result of converterResults) await logResultAction(result, 'share'); notice = '已分享並記錄轉換結果。'; }
      else { await navigator.clipboard.writeText(shareText); for (const result of converterResults) await logResultAction(result, 'copy'); notice = '瀏覽器不支援分享，已複製並記錄轉換結果。'; }
    } catch {
      notice = '分享已取消或目前瀏覽器不支援。';
    }
  }

  $: elapsedMs = getElapsedMs(runningState, now);
  $: filteredRecords = records
    .filter((record) => record.title.toLocaleLowerCase().includes(recordQuery.toLocaleLowerCase()))
    .sort((a, b) => recordSort === 'oldest' ? a.endedAt - b.endedAt
      : recordSort === 'longest' ? b.durationMs - a.durationMs
      : recordSort === 'shortest' ? a.durationMs - b.durationMs
      : b.endedAt - a.endedAt);
  $: todayKey = localDateKey(Date.now());
  $: todayRecords = records.filter((record) => localDateKey(record.endedAt) === todayKey);
  $: todayDurationMs = todayRecords.reduce((total, record) => total + record.durationMs, 0);
  $: totalDurationMs = records.reduce((total, record) => total + record.durationMs, 0);
  $: normalizedResultQuery = resultQuery.toLocaleLowerCase();
  $: filteredResultHistory = resultHistory
    .filter((item) =>
      [item.url, item.sourceLabel].some((value) =>
        value.toLocaleLowerCase().includes(normalizedResultQuery),
      ),
    )
    .sort((a, b) =>
      resultSort === 'oldest' ? a.lastActionAt - b.lastActionAt : b.lastActionAt - a.lastActionAt,
    );
  $: normalizedFavoriteQuery = favoriteQuery.toLocaleLowerCase();
  $: filteredFavorites = favorites
    .filter((item) =>
      [item.title, item.url, item.notes ?? '', favoriteSourceLabel(item)].some((value) =>
        value.toLocaleLowerCase().includes(normalizedFavoriteQuery),
      ),
    )
    .sort((a, b) =>
      favoriteSort === 'oldest' ? a.createdAt - b.createdAt
        : favoriteSort === 'title' ? a.title.localeCompare(b.title, 'zh-TW')
        : favoriteSort === 'updated' ? b.updatedAt - a.updatedAt
        : b.createdAt - a.createdAt,
    );
  $: favoriteGroups = groupFavorites(filteredFavorites);
  $: elapsedLabel = formatDuration(elapsedMs);

  function favoriteSourceLabel(item: FavoriteItem): string {
    return item.source && converterSources[item.source] ? converterSources[item.source].label : sourceForUrl(item.url).label;
  }

  function groupFavorites(items: FavoriteItem[]): { label: string; items: FavoriteItem[] }[] {
    const groups = new Map<string, FavoriteItem[]>();
    for (const item of items) {
      const label = favoriteSourceLabel(item);
      const group = groups.get(label);
      if (group) group.push(item);
      else groups.set(label, [item]);
    }
    return Array.from(groups, ([label, groupedItems]) => ({ label, items: groupedItems }));
  }
  async function logResultAction(result: {key:string;label:string;url:string}, action: 'open'|'copy'|'share') {
    const timestamp = Date.now();
    await recordResultAction({ id: crypto.randomUUID(), url: result.url, source: result.key, sourceLabel: result.label, lastAction: action, lastActionAt: timestamp, createdAt: timestamp });
    resultHistory = await listResultHistory();
  }
  async function openResult(result: {key:string;label:string;url:string}) {
    window.open(result.url, '_blank', 'noopener,noreferrer');
    try { await logResultAction(result, 'open'); notice = '已記錄開啟的' + result.label + '網址。'; }
    catch (error) { storageError = error instanceof Error ? error.message : '無法保存歷史紀錄。'; }
  }
  async function copyResult(result: {key:string;label:string;url:string}) {
    try { await navigator.clipboard.writeText(result.url); await logResultAction(result, 'copy'); notice = '已複製並記錄' + result.label + '網址。'; }
    catch (error) { notice = error instanceof Error ? error.message : '無法複製或保存紀錄。'; }
  }
  async function shareResult(result: {key:string;label:string;url:string}) {
    try {
      if (navigator.share) { await navigator.share({ text: result.url }); await logResultAction(result, 'share'); notice = '已分享並記錄' + result.label + '網址。'; }
      else { await navigator.clipboard.writeText(result.url); await logResultAction(result, 'copy'); notice = '瀏覽器不支援分享，已複製並記錄' + result.label + '網址。'; }
    } catch { notice = '分享已取消或目前瀏覽器不支援。'; }
  }
  async function toggleHistoryFavorite(item: ResultHistoryItem) {
    const existing = favorites.find((favorite) => favorite.url === item.url);
    try {
      if (existing) { await deleteFavorite(existing.id); notice = '已從收藏移除。'; }
      else { const timestamp = Date.now(); await saveFavorite({ id: crypto.randomUUID(), url: item.url, source: item.source, title: item.sourceLabel + ' · ' + item.url, createdAt: timestamp, updatedAt: timestamp }); notice = '已加入收藏。'; }
      favorites = await listFavorites();
    } catch (error) { storageError = error instanceof Error ? error.message : '更新收藏失敗。'; }
  }
  async function removeHistoryItem(id: string) {
    try { await deleteResultHistory(id); resultHistory = await listResultHistory(); notice = '已刪除這筆歷史紀錄。'; }
    catch (error) { storageError = error instanceof Error ? error.message : '刪除歷史紀錄失敗。'; }
  }
  function actionLabel(action: ResultHistoryItem['lastAction']): string { return action === 'open' ? '開啟' : action === 'copy' ? '複製' : '分享'; }

  function makeTitle(timestamp: number): string {
    const date = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
    const time = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(timestamp));
    return date + ' ' + time;
  }

  function persistRunningState() {
    try {
      if (runningState) localStorage.setItem('h-tools-stopwatch-active', JSON.stringify(runningState));
      else localStorage.removeItem('h-tools-stopwatch-active');
    } catch {
      storageError = '瀏覽器無法保存碼錶狀態，重新整理後可能無法恢復。';
    }
  }

  function startStopwatchTick() {
    if (tick) return;
    tick = setInterval(() => { now = Date.now(); }, 1000);
  }

  function stopStopwatchTick() {
    if (tick) clearInterval(tick);
    tick = undefined;
    now = Date.now();
  }

  function startStopwatch() {
    const startedAt = Date.now();
    runningState = { sessionStartedAt: startedAt, startedAt, accumulatedMs: 0, running: true };
    persistRunningState();
    startStopwatchTick();
    notice = '';
  }

  function pauseStopwatch() {
    if (!runningState || !runningState.running) return;
    runningState = { ...runningState, accumulatedMs: getElapsedMs(runningState, Date.now()), running: false };
    persistRunningState();
    stopStopwatchTick();
  }

  function resumeStopwatch() {
    if (!runningState || runningState.running) return;
    runningState = { ...runningState, startedAt: Date.now(), running: true };
    persistRunningState();
    startStopwatchTick();
  }

  async function stopStopwatch() {
    if (!runningState) return;
    const endedAt = Date.now();
    const durationMs = runningState.accumulatedMs + (runningState.running ? Math.max(0, endedAt - runningState.startedAt) : 0);
    const record: StopwatchRecord = {
      id: crypto.randomUUID(),
      startedAt: runningState.sessionStartedAt,
      endedAt,
      durationMs,
      title: makeTitle(runningState.sessionStartedAt),
      createdAt: endedAt,
    };
    try {
      await saveStopwatchRecord(record);
      records = await listStopwatchRecords();
      runningState = null;
      persistRunningState();
      stopStopwatchTick();
      notice = '碼錶紀錄已儲存在這台裝置。';
      storageError = '';
    } catch (error) {
      storageError = error instanceof Error ? error.message : '保存紀錄失敗。';
    }
  }

  async function removeRecord(id: string) {
    try {
      await deleteStopwatchRecord(id);
      records = await listStopwatchRecords();
      notice = '已刪除這筆紀錄。';
    } catch (error) {
      storageError = error instanceof Error ? error.message : '刪除紀錄失敗。';
    }
  }

  async function addFavorite() {
    storageError = '';
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(favoriteUrl.trim());
      if ((parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) throw new Error('Only safe HTTP(S) URLs are supported.');
    } catch {
      storageError = '請輸入有效的 http 或 https 網址。';
      return;
    }
    const timestamp = Date.now();
    const normalizedUrl = parsedUrl.href;
    const conflictingFavorite = favorites.find((item) => item.url === normalizedUrl && item.id !== editingFavoriteId);
    if (editingFavoriteId && conflictingFavorite) {
      storageError = '這個網址已存在於另一筆收藏，請先取消另一筆收藏或改用不同網址。';
      return;
    }
    const existing = favorites.find((item) => item.id === editingFavoriteId) ?? favorites.find((item) => item.url === normalizedUrl);
    const item: FavoriteItem = {
      id: existing?.id ?? crypto.randomUUID(),
      url: normalizedUrl,
      source: existing?.source ?? sourceForUrl(normalizedUrl).key,
      title: favoriteTitle.trim() || parsedUrl.hostname,
      notes: favoriteNotes.trim() || undefined,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    try {
      await saveFavorite(item);
      favorites = await listFavorites();
      favoriteTitle = '';
      favoriteUrl = '';
      favoriteNotes = '';
      editingFavoriteId = null;
      notice = existing ? '已更新這個收藏。' : '已加入收藏。';
    } catch (error) {
      storageError = error instanceof Error ? error.message : '保存收藏失敗。';
    }
  }

  function editFavorite(item: FavoriteItem) {
    editingFavoriteId = item.id;
    favoriteTitle = item.title;
    favoriteUrl = item.url;
    favoriteNotes = item.notes ?? '';
    storageError = '';
    notice = '';
    document.querySelector('.favorite-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelFavoriteEdit() {
    editingFavoriteId = null;
    favoriteTitle = '';
    favoriteUrl = '';
    favoriteNotes = '';
    storageError = '';
  }

  async function removeFavorite(id: string) {
    try {
      await deleteFavorite(id);
      favorites = await listFavorites();
      notice = '已取消收藏。';
    } catch (error) {
      storageError = error instanceof Error ? error.message : '刪除收藏失敗。';
    }
  }

  function updateTheme() {
    const light = window.matchMedia('(prefers-color-scheme: light)').matches;
    const resolved = theme === 'system' ? (light ? 'light' : 'dark') : theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }

  function applyTheme(value: Theme) {
    theme = value;
    try { localStorage.setItem('h-tools-theme', value); } catch { /* Session theme still works. */ }
    updateTheme();
  }

  let importFileInput: HTMLInputElement | undefined;
  let dataBusy = false;
  let syncBusy = false;
  let syncError = '';
  let lastSyncedAt = '';
  const syncWorkerUrl = (import.meta.env.PUBLIC_SYNC_WORKER_URL ?? '').trim();
  const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

  async function runCloudSync() {
    if (!syncWorkerUrl || syncBusy) return;
    syncBusy = true;
    syncError = '';
    notice = '';
    try {
      const result = await syncWithCloud(syncWorkerUrl, theme);
      lastSyncedAt = result.syncedAt;
      try { localStorage.setItem('h-tools-last-synced-at', result.syncedAt); } catch { /* Status remains available for this session. */ }
      const [savedRecords, savedHistory, savedFavorites] = await Promise.all([
        listStopwatchRecords(), listResultHistory(), listFavorites(),
      ]);
      records = savedRecords;
      resultHistory = savedHistory;
      favorites = savedFavorites;
      const remoteTheme = result.document.settings?.theme;
      if (remoteTheme === 'system' || remoteTheme === 'light' || remoteTheme === 'dark') applyTheme(remoteTheme);
      notice = '同步完成。';
    } catch (error) {
      syncError = error instanceof Error ? error.message : '同步失敗，請稍後再試。';
    } finally {
      syncBusy = false;
    }
  }

  async function exportBackup() {
    dataBusy = true;
    storageError = '';
    try {
      const [savedRecords, savedHistory, savedFavorites] = await Promise.all([
        listStopwatchRecords(), listResultHistory(), listFavorites(),
      ]);
      records = savedRecords;
      resultHistory = savedHistory;
      favorites = savedFavorites;
      const backup = {
        format: 'h-tools-backup',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        settings: { theme },
        stopwatchRecords: savedRecords,
        resultHistory: savedHistory,
        favorites: savedFavorites,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'h-tools-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice = '備份已匯出，請妥善保存 JSON 檔案。';
    } catch (error) {
      storageError = error instanceof Error ? error.message : '匯出備份失敗。';
    } finally {
      dataBusy = false;
    }
  }

  function isSafeHttpUrl(value: unknown): value is string {
    if (typeof value !== 'string' || value.length > 4096) return false;
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
    } catch { return false; }
  }

  async function importBackup(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    dataBusy = true;
    storageError = '';
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('備份檔超過 10 MB，無法匯入。');
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object') throw new Error('備份檔格式不正確。');
      const backup = parsed as Record<string, unknown>;
      if (backup.format !== 'h-tools-backup' || backup.schemaVersion !== 1) throw new Error('不支援這個備份格式或版本。');
      const importedRecords = backup.stopwatchRecords;
      const importedHistory = backup.resultHistory;
      const importedFavorites = backup.favorites;
      if (!Array.isArray(importedRecords) || !Array.isArray(importedHistory) || !Array.isArray(importedFavorites)
        || importedRecords.length > 10000 || importedHistory.length > 10000 || importedFavorites.length > 10000) {
        throw new Error('備份資料結構不正確，或單一類型資料超過 10,000 筆。');
      }
      const validRecords = importedRecords.every((value) => {
        if (!value || typeof value !== 'object') return false;
        const item = value as Record<string, unknown>;
        return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200
          && typeof item.title === 'string' && item.title.length <= 500
          && ['startedAt', 'endedAt', 'durationMs', 'createdAt'].every((key) => Number.isSafeInteger(item[key]) && Number(item[key]) >= 0);
      });
      const validHistory = importedHistory.every((value) => {
        if (!value || typeof value !== 'object') return false;
        const item = value as Record<string, unknown>;
        return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200
          && isSafeHttpUrl(item.url) && typeof item.source === 'string' && item.source.length <= 200
          && typeof item.sourceLabel === 'string' && item.sourceLabel.length <= 500
          && ['open', 'copy', 'share'].includes(String(item.lastAction))
          && ['lastActionAt', 'createdAt'].every((key) => Number.isSafeInteger(item[key]) && Number(item[key]) >= 0);
      });
      const validFavorites = importedFavorites.every((value) => {
        if (!value || typeof value !== 'object') return false;
        const item = value as Record<string, unknown>;
        return typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 200
          && isSafeHttpUrl(item.url) && typeof item.title === 'string' && item.title.length <= 500
          && (item.source === undefined || (typeof item.source === 'string' && item.source.length <= 200))
          && (item.notes === undefined || (typeof item.notes === 'string' && item.notes.length <= 5000))
          && ['createdAt', 'updatedAt'].every((key) => Number.isSafeInteger(item[key]) && Number(item[key]) >= 0);
      });
      if (!validRecords || !validHistory || !validFavorites) throw new Error('備份包含無效資料，未匯入任何內容。');
      const hasUniqueIds = (items: unknown[]) => {
        const ids = items.map((value) => (value as { id: string }).id);
        return new Set(ids).size === ids.length;
      };
      const hasUniqueUrls = (items: unknown[]) => {
        const urls = items.map((value) => (value as { url: string }).url);
        return new Set(urls).size === urls.length;
      };
      if (!hasUniqueIds(importedRecords) || !hasUniqueIds(importedHistory) || !hasUniqueIds(importedFavorites)
        || !hasUniqueUrls(importedHistory) || !hasUniqueUrls(importedFavorites)) {
        throw new Error('備份內有重複的 ID 或網址，為避免覆蓋錯誤資料，已取消匯入。');
      }
      if (!window.confirm(`即將合併備份資料：${importedRecords.length} 筆碼錶、${importedHistory.length} 筆歷史、${importedFavorites.length} 筆收藏。現有資料不會整批清除，同 ID 或同網址的項目可能更新。要繼續嗎？`)) return;

      await importBackupData(
        importedRecords as StopwatchRecord[],
        importedHistory as ResultHistoryItem[],
        importedFavorites as FavoriteItem[],
      );
      records = await listStopwatchRecords();
      resultHistory = await listResultHistory();
      favorites = await listFavorites();
      const importedTheme = (backup.settings as { theme?: unknown } | undefined)?.theme;
      if (importedTheme === 'system' || importedTheme === 'light' || importedTheme === 'dark') applyTheme(importedTheme);
      notice = '備份匯入完成，現有資料已與備份合併。';
    } catch (error) {
      storageError = error instanceof Error ? error.message : '匯入備份失敗。';
    } finally {
      dataBusy = false;
      input.value = '';
    }
  }

  async function clearAllLocalData() {
    if (!window.confirm('確定刪除此裝置上的所有碼錶紀錄、歷史紀錄、收藏與進行中的碼錶狀態？此操作無法復原，請先匯出備份。')) return;
    dataBusy = true;
    storageError = '';
    try {
      const [savedRecords, savedHistory, savedFavorites] = await Promise.all([
        listStopwatchRecords(), listResultHistory(), listFavorites(),
      ]);
      for (const item of savedRecords) await deleteStopwatchRecord(item.id);
      for (const item of savedHistory) await deleteResultHistory(item.id);
      for (const item of savedFavorites) await deleteFavorite(item.id);
      try { localStorage.removeItem('h-tools-stopwatch-active'); } catch { /* Other data was still deleted. */ }
      runningState = null;
      stopStopwatchTick();
      records = [];
      resultHistory = [];
      favorites = [];
      notice = '已清除本機資料，介面主題設定仍保留。';
    } catch (error) {
      storageError = error instanceof Error ? error.message : '清除資料失敗，請重新載入後檢查資料狀態。';
      records = await listStopwatchRecords().catch(() => records);
      resultHistory = await listResultHistory().catch(() => resultHistory);
      favorites = await listFavorites().catch(() => favorites);
    } finally {
      dataBusy = false;
    }
  }


  onMount(() => {
    try {
      const storedTheme = localStorage.getItem('h-tools-theme');
      if (storedTheme === 'dark' || storedTheme === 'light' || storedTheme === 'system') theme = storedTheme;
      const active = localStorage.getItem('h-tools-stopwatch-active');
      if (active) {
        const parsed = JSON.parse(active) as RunningState;
        if (isRunningState(parsed)) runningState = parsed;
        else localStorage.removeItem('h-tools-stopwatch-active');
      }
    } catch {
      storageError = '讀取本機設定失敗，部分狀態可能已重設。';
    }
    try { lastSyncedAt = localStorage.getItem('h-tools-last-synced-at') ?? ''; } catch { /* Sync status is optional. */ }
    updateTheme();
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onThemeChange = () => { if (theme === 'system') updateTheme(); };
    media.addEventListener('change', onThemeChange);
    if (runningState?.running) startStopwatchTick();
    listStopwatchRecords().then((value) => { records = value; })
      .catch((error) => { storageError = error instanceof Error ? error.message : '讀取紀錄失敗。'; });
    listFavorites().then((value) => { favorites = value; })
      .catch((error) => { storageError = error instanceof Error ? error.message : '讀取收藏失敗。'; });
    listResultHistory().then((value) => { resultHistory = value; })
      .catch((error) => { storageError = error instanceof Error ? error.message : '讀取歷史紀錄失敗。'; });
    return () => {
      if (tick) clearInterval(tick);
      media.removeEventListener('change', onThemeChange);
    };
  });
</script>

<svelte:head>
  <title>{(navigation.find((item) => item.id === activeSection)?.label ?? 'H Tools') + ' · H Tools'}</title>
</svelte:head>

<div class="app-frame">
  <aside class="sidebar">
    <a class="brand" href="/" aria-label="H Tools 首頁"><span class="brand-mark">H</span><span><strong>H Tools</strong></span></a>
    
    <nav aria-label="主要導覽">
      {#each navigation as item}
        <button class:active={activeSection === item.id} aria-current={activeSection === item.id ? 'page' : undefined} class="nav-item" onclick={() => { activeSection = item.id; notice = ''; }}>
          <span class="nav-icon" aria-hidden="true"><Icon name={item.icon} size={20} /></span><span>{item.label}</span>
          {#if activeSection === item.id}<span class="nav-dot"></span>{/if}
        </button>
      {/each}
    </nav>
    <div class="sidebar-bottom">
      <div class="local-status"><span class="status-dot"></span><span><strong>本機模式</strong></span></div>
      <div class="sidebar-foot">H TOOLS <span>·</span> 0.1.0</div>
    </div>
  </aside>

  <main class="main-area">
    <header class="topbar">
      
      <div class="topbar-actions"><span class="sync-label"><span class="status-dot"></span></span><button class="icon-button" aria-label="前往設定" title="設定" onclick={() => activeSection = 'settings'}><Icon name="settings" size={18} /></button></div>
    </header>

    <div class="content">
      {#if activeSection === 'stopwatch'}
        <section class="page-heading"><h1>碼錶</h1></section>
        <section class="stopwatch-card">
          <div class="card-topline"><span class="live-indicator"></span><span>{runningState?.running ? '計時中' : runningState ? '已暫停' : '準備就緒'}</span></div>
          <div class="timer-display" aria-live="off">{elapsedLabel}<span class="timer-hundredths">.{String(Math.floor((elapsedMs % 1000) / 10)).padStart(2, '0')}</span></div>
          <div class="timer-caption">{#if runningState}{makeTitle(runningState.sessionStartedAt)}{/if}</div>
          <div class="timer-controls">
            {#if !runningState}
              <button class="primary-button" onclick={startStopwatch}><Icon name="play" size={16} /> 開始計時</button>
            {:else if runningState.running}
              <button class="secondary-button" onclick={pauseStopwatch}><Icon name="pause" size={16} /> 暫停</button><button class="primary-button" onclick={stopStopwatch}><Icon name="square" size={15} /> 停止並儲存</button>
            {:else}
              <button class="secondary-button" onclick={resumeStopwatch}><Icon name="play" size={16} /> 繼續</button><button class="primary-button" onclick={stopStopwatch}><Icon name="square" size={15} /> 停止並儲存</button>
            {/if}
          </div>
          
        </section>
        <section class="history-stats" aria-label="碼錶統計"><article class="history-stat"><span>今天完成</span><strong>{todayRecords.length}</strong></article><article class="history-stat"><span>今日累計</span><strong>{formatDuration(todayDurationMs)}</strong></article><article class="history-stat"><span>總計時長</span><strong>{formatDuration(totalDurationMs)}</strong></article></section>
        <section class="records-section full-records"><div class="section-heading"><h2>計時紀錄</h2><span class="count-pill">{records.length} 筆</span></div>
          <div class="history-toolbar"><label class="search-field"><span><Icon name="search" size={17} /></span><input bind:value={recordQuery} placeholder="搜尋計時紀錄…" aria-label="搜尋計時紀錄" /></label><label class="sort-field">排序<select bind:value={recordSort} aria-label="計時紀錄排序"><option value="newest">最新優先</option><option value="oldest">最舊優先</option><option value="longest">時間最長</option><option value="shortest">時間最短</option></select></label></div>
          {#if filteredRecords.length === 0}<div class="record-list empty-state"><div class="empty-icon"><Icon name="history" size={24} /></div><strong>{records.length ? '沒有符合的紀錄' : '尚無計時紀錄'}</strong><span>{records.length ? '試試其他關鍵字' : '停止並儲存碼錶後，紀錄會顯示在這裡'}</span></div>
          {:else}<div class="record-list">{#each filteredRecords as record (record.id)}<article class="record-row"><div class="record-symbol"><Icon name="timer" size={20} /></div><div class="record-info"><strong>{record.title}</strong><small>開始 {new Date(record.startedAt).toLocaleString('zh-TW', { hour12: false })} · 結束 {new Date(record.endedAt).toLocaleString('zh-TW', { hour12: false })}</small></div><div class="record-duration">{formatDuration(record.durationMs)}</div><button class="delete-button" aria-label={'刪除 ' + record.title} title="刪除紀錄" onclick={() => removeRecord(record.id)}><Icon name="trash" size={16} /></button></article>{/each}</div>{/if}
        </section>
      {:else if activeSection === 'settings'}
        <section class="page-heading"><div><h1>設定</h1></div></section>
        <section class="settings-card">
          <div class="settings-section-heading"><h2>外觀</h2></div>
          <div class="setting-row"><div><strong>介面主題</strong></div><div class="theme-options">{#each [{id:'system',label:'系統'},{id:'light',label:'淺色'},{id:'dark',label:'深色'}] as option}<button class:selected={theme === option.id} class="theme-option" aria-pressed={theme === option.id} onclick={() => applyTheme(option.id as Theme)}>{option.label}</button>{/each}</div></div>
        </section>
        <section class="settings-card settings-data-card">
          <div class="settings-section-heading"><h2>資料管理</h2></div>
          <div class="settings-data-stats"><div><strong>{records.length}</strong><span>碼錶紀錄</span></div><div><strong>{resultHistory.length}</strong><span>歷史紀錄</span></div><div><strong>{favorites.length}</strong><span>收藏</span></div></div>
          <div class="setting-row"><div><strong>匯出備份</strong></div><button class="secondary-button" disabled={dataBusy} onclick={() => void exportBackup()}><Icon name="external-link" size={15} /> 匯出 JSON</button></div>
          <div class="setting-row"><div><strong>匯入備份</strong></div><div class="setting-action"><input bind:this={importFileInput} class="visually-hidden-file" type="file" accept="application/json,.json" aria-label="選擇 H Tools 備份檔" onchange={importBackup} /><button class="secondary-button" disabled={dataBusy} onclick={() => importFileInput?.click()}><Icon name="paste" size={15} /> 選擇備份檔</button></div></div>
          <div class="setting-row"><div><strong>清除本機資料</strong></div><button class="danger-button" disabled={dataBusy} onclick={() => void clearAllLocalData()}><Icon name="trash" size={15} /> 清除資料</button></div>
        </section>
        <section class="settings-card settings-sync-card">
          <div class="settings-section-heading"><h2>雲端同步</h2><span class="setting-badge muted">{syncWorkerUrl ? (lastSyncedAt ? '已連接' : '待同步') : '未設定'}</span></div>
          {#if syncWorkerUrl}
            <p class="sync-privacy-warning" role="note">隱私提醒：目前同步檔案位於公開 GitHub 儲存庫，任何人都可能讀取。請勿同步密碼、私人資訊或不希望公開的收藏與歷史紀錄。</p>
            <div class="sync-controls">
              <button class="primary-button" type="button" onclick={() => void runCloudSync()} disabled={syncBusy}>{syncBusy ? '同步中…' : '立即同步'}</button>
            </div>
            <p class="sync-last-success">按下「立即同步」即可合併本機與雲端資料。</p>
          {:else}
            <div class="setting-row"><div><strong>尚未設定同步服務</strong></div><button class="secondary-button" disabled>立即同步</button></div>
          {/if}
          {#if lastSyncedAt}<p class="sync-last-success">上次同步：{new Date(lastSyncedAt).toLocaleString('zh-TW', { hour12: false })}</p>{/if}
          {#if syncError}<p class="sync-error" role="alert">{syncError}</p>{/if}
        </section>
      {:else if activeSection === 'history'}
        <section class="page-heading"><div><h1>歷史紀錄</h1><p>開啟、複製或分享過的結果會自動整理在這裡。</p></div><span class="count-pill">{resultHistory.length} 筆</span></section>
        <section class="records-section full-records"><div class="history-toolbar"><label class="search-field"><span><Icon name="search" size={17} /></span><input bind:value={resultQuery} placeholder="搜尋網址或來源站…" aria-label="搜尋結果歷史紀錄" /></label><label class="sort-field">排序<select bind:value={resultSort} aria-label="歷史紀錄排序"><option value="newest">最近操作</option><option value="oldest">最早操作</option></select></label></div>
          {#if filteredResultHistory.length === 0}<div class="record-list empty-state"><div class="empty-icon"><Icon name="history" size={24} /></div><strong>{resultHistory.length ? '沒有符合的紀錄' : '目前沒有歷史紀錄'}</strong><span>{resultHistory.length ? '試試其他關鍵字' : '開啟、複製或分享轉換結果後，就會自動記錄在這裡'}</span></div>
          {:else}<div class="favorite-list">{#each filteredResultHistory as item (item.id)}<article class="favorite-row"><div class="record-symbol"><Icon name="external-link" size={20} /></div><div class="record-info"><strong>{item.sourceLabel}</strong><a href={item.url} target="_blank" rel="noopener noreferrer" onclick={() => void logResultAction({key:item.source,label:item.sourceLabel,url:item.url}, 'open')}>{item.url}</a><small>最後操作：{actionLabel(item.lastAction)} · {new Date(item.lastActionAt).toLocaleString('zh-TW', { hour12: false })}</small></div><button class="edit-favorite" aria-label={favorites.some((favorite) => favorite.url === item.url) ? '取消收藏' : '加入收藏'} title={favorites.some((favorite) => favorite.url === item.url) ? '取消收藏' : '加入收藏'} onclick={() => toggleHistoryFavorite(item)}>{#if favorites.some((favorite) => favorite.url === item.url)}<Icon name="star-filled" size={17} />{:else}<Icon name="star" size={17} />{/if}</button><button class="open-favorite" aria-label="複製網址" title="複製網址" onclick={() => void copyResult({key:item.source,label:item.sourceLabel,url:item.url})}><Icon name="copy" size={16} /></button><button class="delete-button" aria-label="刪除歷史紀錄" title="刪除紀錄" onclick={() => removeHistoryItem(item.id)}><Icon name="trash" size={16} /></button></article>{/each}</div>{/if}
        </section>
      {:else if activeSection === 'converter'}
        <section class="page-heading"><h1>編號轉換</h1></section>
        <section class="converter-layout">
          <div class="converter-source-card">
            <label class="converter-source-label" for="converter-site">來源</label>
            <select id="converter-site" class="converter-site-select" bind:value={converterSite} onchange={() => { converterInput = converterInput.toLowerCase(); updateConverterOutput(); }}>
              <option value="AUTO">自動識別</option>
              <option value="N">N 站（nhentai）</option>
              <option value="W">紳士漫畫</option>
              <option value="JM">禁漫天堂</option>
              <option value="P">Pixiv</option>
              <option value="M">MissAV</option>
              <option value="J">Jable</option>
            </select>
            <div class="converter-input-wrap">
              <input id="converter-id" class="converter-id-input" bind:value={converterInput} oninput={() => { converterInput = converterInput.toLowerCase(); updateConverterOutput(); }} placeholder="輸入編號或文字" aria-label="作品編號或文字" />
              <div class="converter-input-actions">
                <button class="converter-icon-button" aria-label="貼上編號" title="貼上" onclick={pasteConverterInput}><Icon name="paste" size={18} /></button>
                <button class="converter-icon-button" aria-label="清除" title="清除" onclick={clearConverter}><Icon name="x" size={18} /></button>
                {#if converterSite !== 'M' && converterSite !== 'J'}<button class="converter-icon-button" aria-label="隨機編號" title="隨機編號" onclick={randomConverter}><Icon name="shuffle" size={18} /></button>{/if}
              </div>
            </div>
            
          </div>
          <div class="converter-output-card">
            <div class="converter-output-label">轉換結果</div>
            {#if converterResults.length > 1}
              <div class="converter-bulk-actions"><span>{converterResults.length} 個結果</span><button class="secondary-button" onclick={copyConverterOutput}><Icon name="copy" size={15} /> 複製全部網址</button></div>
              <div class="converter-multi-results">
                {#each converterResults as result (result.key)}
                  <div class="converter-multi-result">
                    <div class="converter-multi-heading">{result.label}</div>
                    <div class="converter-multi-url">{result.url}</div>
                    <div class="converter-multi-actions">
                      <button class="secondary-button" onclick={() => void openResult(result)}><Icon name="external-link" size={15} /> 開啟</button>
                      <button class="secondary-button" onclick={() => void copyResult(result)}><Icon name="copy" size={15} /> 複製</button>
                      <button class="secondary-button" onclick={() => void shareResult(result)}><Icon name="share" size={15} /> 分享</button>
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="converter-output-row">
                <div class="converter-output-text" aria-live="polite">{converterOutput || '轉換結果'}</div>
                <div class="converter-output-actions">
                  <button class="converter-icon-button" disabled={!converterOutput} aria-label="複製結果" title="複製結果" onclick={copyConverterOutput}><Icon name="copy" size={18} /></button>
                  <button class="converter-icon-button" disabled={!converterOutput} aria-label="分享結果" title="分享結果" onclick={shareConverterOutput}><Icon name="share" size={18} /></button>
                </div>
              </div>
              <div class="converter-result-actions">
                <button class="secondary-button" disabled={!converterUrl} onclick={() => { const result = converterResults[0]; if (result) void openResult(result); }}><Icon name="external-link" size={15} /> 開啟</button>
              </div>
            {/if}
          </div>
        </section>
      {:else}
        <section class="page-heading"><div><h1>我的收藏</h1><p>依來源站分類整理，星號可從歷史紀錄快速加入或移除。</p></div><span class="count-pill">{favorites.length} 筆</span></section>
        <section class="favorite-editor">
          <div class="editor-heading"><div class="placeholder-icon"><Icon name="star" size={22} /></div><div><h2>{editingFavoriteId ? '編輯收藏' : '新增收藏'}</h2></div></div>
          <form class="favorite-form" onsubmit={(event) => { event.preventDefault(); void addFavorite(); }}>
            <label>網址 <input bind:value={favoriteUrl} type="url" required placeholder="https://example.com/page" /></label>
            <label>標題 <input bind:value={favoriteTitle} placeholder="留空時使用網站網域" /></label>
            <label>備註 <input bind:value={favoriteNotes} placeholder="選填，例如用途或關鍵字" /></label>
            <div class="favorite-form-actions"><button class="primary-button" type="submit">{editingFavoriteId ? '儲存變更' : '＋ 儲存收藏'}</button>{#if editingFavoriteId}<button class="secondary-button" type="button" onclick={cancelFavoriteEdit}>取消編輯</button>{/if}</div>
          </form>
        </section>
        <section class="records-section full-records">
          <div class="history-toolbar"><label class="search-field"><span><Icon name="search" size={17} /></span><input bind:value={favoriteQuery} placeholder="搜尋標題、網址或備註…" aria-label="搜尋收藏" /></label><label class="sort-field">排序<select bind:value={favoriteSort} aria-label="收藏排序"><option value="newest">最近加入</option><option value="oldest">最早加入</option><option value="updated">最近更新</option><option value="title">標題 A 到 Z</option></select></label></div>
          {#if filteredFavorites.length === 0}
            <div class="record-list empty-state"><div class="empty-icon"><Icon name="star" size={24} /></div><strong>{favorites.length ? '沒有符合的收藏' : '收藏清單是空的'}</strong><span>{favorites.length ? '試試其他關鍵字' : '新增網址即可收藏'}</span></div>
          {:else}
            {#each favoriteGroups as group (group.label)}<section class="favorite-group"><div class="section-heading"><h2>{group.label}</h2><span class="count-pill">{group.items.length} 筆</span></div><div class="favorite-list">{#each group.items as item (item.id)}<article class="favorite-row"><div class="record-symbol"><Icon name="star-filled" size={20} /></div><div class="record-info"><strong>{item.title}</strong><a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a>{#if item.notes}<small>{item.notes}</small>{/if}<small>更新於 {new Date(item.updatedAt).toLocaleString('zh-TW', { hour12: false })}</small></div><button class="edit-favorite" aria-label={'編輯 ' + item.title} title="編輯收藏" onclick={() => editFavorite(item)}><Icon name="pencil" size={16} /></button><a class="open-favorite" href={item.url} target="_blank" rel="noopener noreferrer" aria-label={'開啟 ' + item.title} title="在新分頁開啟"><Icon name="external-link" size={16} /></a><button class="delete-button" aria-label={'取消收藏 ' + item.title} title="取消收藏" onclick={() => removeFavorite(item.id)}><Icon name="trash" size={16} /></button></article>{/each}</div></section>{/each}
          {/if}
        </section>
      {/if}

      {#if storageError}<div class="toast error" role="alert">{storageError}</div>{/if}
      {#if notice}<div class="toast" role="status">{notice}<button aria-label="關閉通知" onclick={() => notice = ''}><Icon name="x" size={16} /></button></div>{/if}
      
    </div>
  </main>
</div>

<style>
  .app-frame { --bg:#0b0e14; --panel:#111722; --panel-2:#151d2b; --line:#252e3d; --text:#e8edf7; --muted:#8a96aa; --accent:#9caeff; --accent-strong:#7892ff; display:flex; min-height:100vh; background:var(--bg); color:var(--text); }
  :global(:root[data-theme="light"]) .app-frame { --bg:#f4f6fb; --panel:#fff; --panel-2:#f8f9fd; --line:#e1e6f0; --text:#172033; --muted:#68758c; --accent:#405fdb; --accent-strong:#3452cb; }
  .sidebar { width:244px; flex:0 0 244px; border-right:1px solid var(--line); padding:27px 15px 18px; display:flex; flex-direction:column; background:var(--bg); }
  .brand { display:flex; align-items:center; gap:12px; text-decoration:none; color:var(--text); padding:0 10px 35px; }
  .brand-mark { width:38px; height:38px; border-radius:12px; display:grid; place-items:center; font-weight:800; font-size:20px; color:#0b1020; background:linear-gradient(145deg,#c2ceff,#738cff); }
  .brand strong { display:block; font-size:15px; letter-spacing:.02em; }.brand small { display:block; color:var(--muted); font-size:8px; letter-spacing:.15em; margin-top:4px; }
  .nav-label { font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); padding:0 13px 12px; }
  nav { display:grid; gap:5px; }.nav-item { display:flex; align-items:center; gap:12px; width:100%; border:1px solid transparent; color:var(--muted); background:transparent; border-radius:10px; padding:11px 12px; text-align:left; cursor:pointer; font-size:13px; }
  .nav-item:hover { background:var(--panel); color:var(--text); }.nav-item.active { color:var(--text); background:var(--panel-2); border-color:var(--line); }
  .nav-icon { width:20px; text-align:center; font-size:18px; line-height:1; }.nav-dot { width:5px; height:5px; border-radius:50%; background:var(--accent-strong); margin-left:auto; }
  .sidebar-bottom { margin-top:auto; }.local-status { display:flex; align-items:center; gap:10px; border:1px solid var(--line); background:var(--panel); padding:12px; border-radius:11px; }
  .status-dot,.live-indicator { width:7px; height:7px; flex:0 0 7px; background:#62d8a3; border-radius:50%; box-shadow:0 0 0 4px #62d8a314; }
  .local-status strong { display:block; font-size:11px; font-weight:600; }.local-status small { display:block; margin-top:3px; font-size:10px; color:var(--muted); }
  .sidebar-foot { color:var(--muted); font-size:9px; letter-spacing:.14em; padding:20px 10px 0; }.sidebar-foot span { padding:0 4px; color:var(--line); }
  .main-area { min-width:0; flex:1; }.topbar { height:70px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; padding:0 clamp(20px,4vw,54px); }
  .breadcrumb { display:flex; align-items:center; gap:11px; font-size:11px; color:var(--muted); }.breadcrumb .slash { color:var(--line); }.breadcrumb strong { color:var(--text); font-weight:500; }
  .topbar-actions { display:flex; align-items:center; gap:17px; }.sync-label { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:10px; }.sync-label .status-dot { width:6px; height:6px; flex-basis:6px; }
  .icon-button { width:33px; height:33px; border:1px solid var(--line); border-radius:9px; background:var(--panel); color:var(--muted); cursor:pointer; }
  .content { width:min(100%,1050px); margin:0 auto; padding:42px clamp(20px,4vw,54px) 22px; }.page-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:28px; }
  .eyebrow { font-size:9px; color:var(--accent); letter-spacing:.19em; font-weight:700; margin-bottom:10px; }h1 { font-size:clamp(25px,3vw,32px); letter-spacing:-.04em; margin:0; line-height:1.2; font-weight:650; }
  .page-heading p { color:var(--muted); font-size:12px; margin:10px 0 0; line-height:1.7; }.heading-chip { display:flex; align-items:center; gap:8px; padding:8px 11px; border:1px solid var(--line); border-radius:999px; color:var(--muted); font-size:10px; white-space:nowrap; }.pulse { width:6px; height:6px; background:#62d8a3; border-radius:50%; }
  .stopwatch-card { overflow:hidden; border:1px solid #2a3448; border-radius:16px; padding:23px 26px 19px; background:radial-gradient(ellipse at 50% -30%,#5368b522 0%,transparent 60%),linear-gradient(135deg,#121927,#0f141e); box-shadow:0 20px 60px #00000012; }
  :global(:root[data-theme="light"]) .stopwatch-card { background:radial-gradient(ellipse at 50% -30%,#8d9eff22 0%,transparent 60%),linear-gradient(135deg,#fff,#f7f8ff); border-color:#dfe4f4; }
  .card-topline { display:flex; align-items:center; gap:9px; font-size:9px; letter-spacing:.13em; color:#9aa7be; }.live-indicator { width:6px; height:6px; flex-basis:6px; }.card-topline-right { margin-left:auto; font-size:8px; color:#68758b; }
  .timer-display { display:flex; justify-content:center; align-items:baseline; margin:44px 0 7px; font-size:clamp(48px,8vw,79px); font-variant-numeric:tabular-nums; letter-spacing:-.065em; line-height:1; font-weight:450; color:var(--text); }.timer-hundredths { font-size:.36em; color:var(--accent); letter-spacing:-.02em; margin-left:3px; }.timer-caption { text-align:center; font-size:10px; color:var(--muted); min-height:16px; }
  .timer-controls { display:flex; justify-content:center; gap:10px; margin:29px 0 25px; }.primary-button,.secondary-button { border-radius:9px; padding:11px 17px; border:1px solid transparent; cursor:pointer; font-size:11px; font-weight:650; transition:transform .15s,filter .15s; }.primary-button:hover,.secondary-button:hover { filter:brightness(1.08); transform:translateY(-1px); }
  .primary-button { background:linear-gradient(135deg,#b8c5ff,#879bff); color:#11182c; }.secondary-button { background:#202a3a; border-color:#344158; color:#d7deee; }:global(:root[data-theme="light"]) .secondary-button { background:#edf0fa; color:#26314a; border-color:#d9deed; }
  .card-footnote { display:flex; justify-content:center; align-items:center; gap:7px; padding-top:15px; border-top:1px solid #ffffff0c; color:#7f8ba1; font-size:9px; }.card-footnote span { color:var(--accent); font-size:13px; }
  .records-section { margin-top:32px; }.section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }.section-heading h2 { font-size:15px; margin:0; }.section-heading p { font-size:10px; color:var(--muted); margin:6px 0 0; }.count-pill { border:1px solid var(--line); border-radius:7px; padding:5px 8px; font-size:10px; color:var(--muted); }
  .record-list { border:1px solid var(--line); border-radius:13px; overflow:hidden; background:var(--panel); }.record-row { display:flex; align-items:center; gap:13px; min-height:70px; padding:12px 16px; border-bottom:1px solid var(--line); }.record-row:last-child { border-bottom:0; }
  .record-symbol { display:grid; place-items:center; width:34px; height:34px; flex:0 0 34px; border:1px solid var(--line); border-radius:10px; color:var(--accent); background:var(--panel-2); font-size:17px; }.record-info { min-width:0; flex:1; }.record-info strong { display:block; font-size:11px; font-weight:600; overflow-wrap:anywhere; }.record-info small { display:block; margin-top:5px; font-size:9px; color:var(--muted); }
  .record-duration { font-size:12px; font-variant-numeric:tabular-nums; letter-spacing:.03em; }.delete-button { width:27px; height:27px; border:1px solid transparent; background:transparent; color:var(--muted); border-radius:7px; font-size:19px; cursor:pointer; }.delete-button:hover { color:#ff8f9b; border-color:#ff8f9b35; }
  .empty-state { min-height:164px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:8px; text-align:center; padding:25px 15px; }.empty-icon { width:38px; height:38px; display:grid; place-items:center; border:1px solid var(--line); border-radius:12px; color:var(--accent); background:var(--panel-2); font-size:20px; margin-bottom:3px; }.empty-state strong { font-size:11px; font-weight:600; }.empty-state span { font-size:10px; color:var(--muted); line-height:1.6; }
  .text-button { display:block; width:100%; padding:13px; border:0; background:transparent; color:var(--accent); cursor:pointer; font-size:10px; } .favorite-editor { border:1px solid var(--line); border-radius:14px; background:var(--panel); padding:20px; }.editor-heading { display:flex; align-items:center; gap:12px; }.editor-heading .placeholder-icon { flex:0 0 40px; width:40px; height:40px; margin:0; }.editor-heading h2 { margin:0; font-size:13px; }.editor-heading p { margin:6px 0 0; color:var(--muted); font-size:10px; line-height:1.6; }.favorite-form { display:grid; grid-template-columns:1.4fr 1fr 1fr auto; gap:11px; align-items:end; margin-top:18px; }.favorite-form label { display:grid; gap:7px; color:var(--muted); font-size:10px; }.favorite-form input { min-width:0; width:100%; border:1px solid var(--line); border-radius:8px; padding:10px; background:var(--bg); color:var(--text); font-size:10px; outline:none; }.favorite-form input:focus { border-color:var(--accent-strong); }.favorite-form .primary-button { white-space:nowrap; padding:11px 12px; }.favorite-group { margin-bottom:22px; }.favorite-group .section-heading { margin:18px 0 10px; }.favorite-list { border:1px solid var(--line); border-radius:13px; overflow:hidden; background:var(--panel); }.favorite-row { display:flex; align-items:center; gap:12px; padding:14px; border-bottom:1px solid var(--line); }.favorite-row:last-child { border-bottom:0; }.favorite-row .record-info { overflow:hidden; }.favorite-row .record-info a { display:block; margin-top:5px; font-size:10px; color:var(--accent); text-decoration:none; overflow-wrap:anywhere; }.favorite-row .record-info a:hover { text-decoration:underline; }.favorite-row .record-info small { overflow-wrap:anywhere; }.open-favorite { display:grid; place-items:center; width:29px; height:29px; flex:0 0 29px; border:1px solid var(--line); border-radius:8px; color:var(--accent); text-decoration:none; }.settings-card { border:1px solid var(--line); border-radius:14px; background:var(--panel); padding:0 22px; margin-bottom:16px; }
  .settings-section-heading { display:flex; align-items:center; gap:12px; padding:16px 0 14px; border-bottom:1px solid var(--line); }.settings-section-heading > div:nth-child(2) { flex:1; min-width:0; }.settings-section-heading h2 { margin:0; font-size:13px; font-weight:650; }.settings-section-heading p { margin:6px 0 0; color:var(--muted); font-size:10px; line-height:1.7; }.settings-section-icon { display:grid; place-items:center; width:36px; height:36px; flex:0 0 36px; border:1px solid var(--line); border-radius:11px; background:var(--panel-2); color:var(--accent); }
  .settings-data-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; padding:16px 0 4px; }.settings-data-stats > div { display:flex; flex-direction:column; gap:5px; padding:12px; border:1px solid var(--line); border-radius:10px; background:var(--bg); }.settings-data-stats strong { font-size:20px; font-variant-numeric:tabular-nums; }.settings-data-stats span { color:var(--muted); font-size:10px; }
  .setting-action { display:flex; align-items:center; gap:8px; }.visually-hidden-file { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }.danger-button { display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:10px 12px; border:1px solid #ff8f9b55; border-radius:9px; color:#ff9aa5; background:#ff8f9b0b; font-size:10px; cursor:pointer; white-space:nowrap; }.danger-button:hover:not(:disabled) { background:#ff8f9b18; border-color:#ff8f9b88; }.danger-button:disabled { opacity:.45; cursor:not-allowed; }.setting-row .secondary-button { display:inline-flex; align-items:center; justify-content:center; gap:7px; white-space:nowrap; }
  .sync-explainer { display:flex; gap:12px; align-items:flex-start; padding:18px 0 4px; }.sync-status-icon { display:grid; place-items:center; width:36px; height:36px; flex:0 0 36px; border:1px solid var(--line); border-radius:11px; background:var(--panel-2); color:var(--muted); }.sync-explainer strong { font-size:11px; }.sync-explainer p { margin:6px 0 0; max-width:640px; color:var(--muted); font-size:10px; line-height:1.8; }
  .settings-sync-card .settings-section-heading { border-bottom:0; }.settings-sync-card .setting-row { margin-top:8px; }
  .sync-privacy-warning { margin:8px 0 4px; padding:10px 12px; border:1px solid var(--line); border-radius:9px; color:var(--muted); font-size:11px; line-height:1.7; }.sync-controls { display:flex; align-items:center; gap:10px; padding:14px 0 6px; }.sync-controls input { min-width:0; flex:1; padding:10px 12px; border:1px solid var(--line); border-radius:9px; background:var(--bg); color:var(--text); font:inherit; font-size:11px; outline:none; }.sync-controls input:focus { border-color:var(--accent); }.sync-last-success,.sync-error { margin:8px 0 14px; font-size:10px; line-height:1.6; }.sync-last-success { color:var(--muted); }.sync-error { color:#ff9aa5; }

  .setting-row { display:flex; justify-content:space-between; align-items:center; gap:20px; padding:16px 0; border-bottom:1px solid var(--line); }.setting-row:last-child { border-bottom:0; }.setting-row strong { font-size:12px; }.setting-row p { margin:7px 0 0; max-width:470px; font-size:10px; color:var(--muted); line-height:1.7; }
  .theme-options { display:flex; padding:3px; gap:2px; border:1px solid var(--line); border-radius:9px; background:var(--bg); flex-shrink:0; }.theme-option { padding:7px 10px; border:0; background:transparent; color:var(--muted); border-radius:6px; cursor:pointer; font-size:10px; }.theme-option.selected { background:var(--panel-2); color:var(--text); box-shadow:0 0 0 1px var(--line); }
  .setting-badge { border:1px solid #62d8a32a; color:#62d8a3; background:#62d8a30b; border-radius:6px; padding:6px 8px; white-space:nowrap; font-size:8px; letter-spacing:.08em; }.setting-badge.muted { color:var(--muted); border-color:var(--line); background:transparent; letter-spacing:0; }
  .history-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-bottom:20px; }
  .history-stat { min-width:0; padding:17px; border:1px solid var(--line); border-radius:12px; background:var(--panel); }
  .history-stat span,.history-stat small { display:block; color:var(--muted); font-size:10px; }
  .history-stat strong { display:block; margin:11px 0 6px; font-size:clamp(17px,2vw,23px); font-weight:600; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
  .history-stat small { font-size:9px; }
  .history-toolbar { display:flex; align-items:center; gap:12px; margin-bottom:13px; }
  .history-toolbar .search-field { flex:1; margin:0; }
  .sort-field { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:10px; white-space:nowrap; }
  .sort-field select { border:1px solid var(--line); border-radius:8px; padding:10px; background:var(--panel); color:var(--text); font-size:10px; outline:none; }
  .sort-field select:focus { border-color:var(--accent-strong); }
  .full-records { margin-top:0; }.search-field { display:flex; align-items:center; gap:9px; border:1px solid var(--line); border-radius:10px; padding:0 12px; height:43px; margin-bottom:13px; background:var(--panel); color:var(--muted); }.search-field span { font-size:21px; }.search-field input { flex:1; min-width:0; border:0; outline:0; background:transparent; color:var(--text); font-size:11px; }
  .placeholder-card { border:1px solid var(--line); border-radius:15px; padding:clamp(24px,5vw,44px); background:var(--panel); display:flex; align-items:flex-start; flex-direction:column; }.placeholder-icon { width:44px; height:44px; border:1px solid var(--line); border-radius:13px; background:var(--panel-2); display:grid; place-items:center; color:var(--accent); font-size:22px; margin-bottom:21px; }.placeholder-card h2 { font-size:16px; margin:0; }.placeholder-card p { font-size:11px; line-height:1.8; color:var(--muted); max-width:480px; margin:11px 0 24px; }.placeholder-card label { font-size:10px; color:var(--muted); margin-bottom:8px; }.converter-input { width:100%; max-width:460px; border:1px solid var(--line); background:var(--bg); color:var(--text); border-radius:9px; padding:12px; font-size:11px; outline:none; margin-bottom:12px; }.converter-input:focus,.search-field:focus-within { border-color:var(--accent-strong); }.placeholder-card > small { margin-top:14px; color:var(--muted); font-size:9px; line-height:1.6; }
  .toast { position:sticky; bottom:14px; margin:16px auto 0; width:fit-content; max-width:100%; padding:11px 15px; border:1px solid #62d8a344; background:var(--panel); border-radius:10px; box-shadow:0 8px 30px #0002; color:var(--text); font-size:10px; z-index:2; }.toast.error { border-color:#ff8f9b55; color:#ffabb3; }.toast button { margin-left:15px; background:transparent; border:0; color:var(--muted); cursor:pointer; font-size:15px; }
  .page-footer { display:flex; justify-content:space-between; gap:15px; color:#667188; font-size:8px; letter-spacing:.07em; margin-top:39px; }
  @media (max-width:760px) {
    .app-frame { display:block; padding-bottom:calc(75px + env(safe-area-inset-bottom)); }.sidebar { position:fixed; z-index:5; bottom:0; left:0; right:0; width:auto; height:calc(66px + env(safe-area-inset-bottom)); padding:5px 7px max(5px,env(safe-area-inset-bottom)); border-right:0; border-top:1px solid var(--line); background:var(--panel); }.brand,.nav-label,.sidebar-bottom { display:none; }
    nav { height:100%; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:3px; }.nav-item { position:relative; justify-content:center; align-items:center; flex-direction:column; gap:4px; padding:6px 1px; font-size:9px; border-radius:8px; }.nav-icon { font-size:17px; }.nav-dot { position:absolute; top:4px; right:calc(50% - 16px); width:4px; height:4px; }
    .topbar { height:55px; padding:0 18px; }.sync-label { font-size:0; gap:0; }.sync-label .status-dot { width:7px; height:7px; }.topbar-actions { gap:11px; }.content { padding:29px 17px 20px; }.page-heading { margin-bottom:22px; }.heading-chip { font-size:9px; padding:7px 9px; }
    .stopwatch-card { padding:19px 15px 16px; border-radius:13px; }.timer-display { margin-top:42px; font-size:clamp(43px,12vw,65px); }.timer-controls { margin:27px 0 23px; }.primary-button,.secondary-button { padding:11px 13px; }.card-footnote { font-size:8px; text-align:center; }
    .records-section { margin-top:26px; }.history-stats { grid-template-columns:1fr; gap:8px; }.history-stat { display:grid; grid-template-columns:1fr auto; align-items:center; gap:4px 12px; padding:12px; }.history-stat strong { grid-column:2; grid-row:1 / span 2; margin:0; font-size:18px; }.history-stat small { grid-column:1; }.history-toolbar { align-items:stretch; flex-direction:column; }.sort-field { justify-content:space-between; }.record-row { gap:9px; padding:11px; }.record-symbol { width:30px; height:30px; flex-basis:30px; }.record-duration { font-size:10px; }.setting-row { align-items:flex-start; flex-direction:column; gap:13px; }.settings-card { padding:0 16px; }.settings-data-stats { gap:6px; }.settings-data-stats > div { padding:9px 7px; }.settings-data-stats strong { font-size:17px; }.settings-section-heading { align-items:flex-start; flex-wrap:wrap; }.settings-section-heading > .setting-badge { margin-left:48px; }.setting-action,.setting-row .secondary-button,.danger-button { max-width:100%; }.sync-explainer { gap:9px; }.favorite-form { grid-template-columns:1fr; }.favorite-form .primary-button { width:100%; }.favorite-editor { padding:15px; }.favorite-row { gap:8px; padding:11px; }.favorite-row .record-info { min-width:0; }.page-footer { margin-top:28px; font-size:7px; }
  }
  :global(button:focus-visible), :global(a:focus-visible), :global(input:focus-visible), :global(select:focus-visible) { outline:2px solid var(--accent-strong); outline-offset:3px; }
  @media (prefers-reduced-motion: reduce) { *,*::before,*::after { scroll-behavior:auto !important; transition:none !important; animation:none !important; } }

  .converter-layout { display:grid; gap:16px; max-width:840px; margin:0 auto; }
  .converter-source-card,.converter-output-card { border:1px solid var(--line); border-radius:18px; padding:20px; background:var(--panel); box-shadow:0 12px 35px #0000000a; }
  .converter-source-label,.converter-output-label { display:block; margin-bottom:10px; color:var(--muted); font-size:11px; font-weight:600; }
  .converter-site-select { width:100%; border:0; border-radius:11px; padding:13px 14px; background:var(--panel-2); color:var(--text); font-size:13px; outline:1px solid var(--line); }
  .converter-input-wrap { display:flex; align-items:center; gap:8px; margin-top:14px; border:1px solid var(--line); border-radius:12px; padding:5px 8px 5px 16px; background:var(--bg); }
  .converter-id-input { min-width:0; width:100%; border:0; outline:0; background:transparent; color:var(--text); text-align:center; font-size:clamp(35px,7vw,54px); letter-spacing:.03em; padding:10px 0; font-variant-numeric:tabular-nums; }
  .converter-id-input::placeholder { color:var(--muted); opacity:.7; font-size:clamp(22px,4vw,32px); letter-spacing:0; }
  .converter-input-actions,.converter-output-actions { display:flex; flex-direction:column; gap:5px; }
  .converter-icon-button { width:34px; height:34px; flex:0 0 34px; display:grid; place-items:center; border:1px solid var(--line); border-radius:9px; background:var(--panel-2); color:var(--muted); cursor:pointer; font-size:17px; }
  .converter-icon-button:hover:not(:disabled) { color:var(--text); border-color:var(--accent); }
  .converter-icon-button:disabled { opacity:.35; cursor:not-allowed; }
  .converter-hint { margin:10px 2px 0; color:var(--muted); font-size:10px; }
  .converter-output-row { display:flex; align-items:center; gap:12px; min-height:84px; border:1px solid var(--line); border-radius:12px; padding:12px; background:var(--bg); }
  .converter-bulk-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 12px; color:var(--muted); font-size:11px; }
  .converter-multi-results { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .converter-multi-result { min-width:0; display:flex; flex-direction:column; gap:10px; border:1px solid var(--line); border-radius:12px; padding:14px; background:var(--bg); }
  .converter-multi-heading { font-size:12px; font-weight:700; color:var(--accent); }
  .converter-multi-url { min-width:0; flex:1; overflow-wrap:anywhere; font-size:11px; line-height:1.7; }
  .converter-multi-actions { display:flex; align-items:center; gap:8px; }
  .converter-multi-actions .secondary-button { flex:1; min-width:0; display:flex; align-items:center; justify-content:center; gap:5px; white-space:nowrap; padding:9px 8px; font-size:10px; }
  @media (max-width:520px) { .converter-multi-results { grid-template-columns:1fr; } }
  .converter-output-text { min-width:0; flex:1; text-align:center; white-space:pre-line; overflow-wrap:anywhere; font-size:13px; line-height:1.7; }
  .converter-result-actions { display:flex; gap:12px; margin-top:14px; }
  .converter-result-actions button { flex:1; }
  .converter-result-actions button:disabled { opacity:.4; cursor:not-allowed; transform:none; }
  .converter-preview-note { display:flex; gap:8px; align-items:flex-start; margin-top:16px; padding-top:13px; border-top:1px solid var(--line); color:var(--muted); font-size:10px; line-height:1.7; }
  .converter-preview-note span { color:var(--accent); }
  .converter-footer-actions { display:flex; align-items:center; justify-content:space-between; color:var(--muted); font-size:9px; letter-spacing:.12em; padding:0 4px; }
  .converter-footer-actions .text-button { width:auto; padding:8px; font-size:10px; letter-spacing:0; }
  .footer-separator { color:var(--line); padding:0 4px; }
</style>
