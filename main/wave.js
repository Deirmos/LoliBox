const { buildRecommendations } = require('./recommend');

async function buildWave(input) {
  return buildRecommendations(input);
}

function setupWaveHandlers(ipcMain) {
  ipcMain.handle('wave:build', async (event, input) => {
    try {
      return await buildWave(input);
    } catch (err) {
      console.error('[Wave] error:', err.message);
      throw new Error(`Не удалось собрать «Мою волну»: ${err.message}`);
    }
  });
}

module.exports = { setupWaveHandlers, buildWave };
