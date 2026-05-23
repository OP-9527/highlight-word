// 监听页面卸载事件
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupOnUnload);
}

if (!document.location.href.startsWith('chrome://') && !document.location.href.endsWith('xml')) {
  if (shouldRunInCurrentFrame()) {
    initialize();
  }
}
