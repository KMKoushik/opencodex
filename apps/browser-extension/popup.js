const form = document.querySelector('#pair');
const input = document.querySelector('#url');
const status = document.querySelector('#status');
const connect = document.querySelector('#connect');
const disconnect = document.querySelector('#disconnect');

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: 'status' });
  status.textContent = state.connected
    ? `Connected · ${state.claimedTabs} claimed tabs`
    : state.error || 'Disconnected';
  connect.disabled = state.connected;
  disconnect.disabled = !state.connected;
}

input.value = (await chrome.storage.local.get('pairingURL')).pairingURL || '';
await refresh();
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  connect.disabled = true;
  status.textContent = 'Connecting…';
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'connect',
      pairingURL: input.value.trim(),
    });
    if (result.error) throw new Error(result.error);
    await refresh();
  } catch (error) {
    status.textContent = error.message;
    connect.disabled = false;
  }
});
disconnect.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'disconnect' });
  await refresh();
});
