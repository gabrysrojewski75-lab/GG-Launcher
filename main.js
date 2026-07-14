const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const { exec, spawn } = require('child_process');

// Load Developer Config if exists
const devConfigPath = path.join(__dirname, 'update_config.json');
let devConfig = null;
if (fs.existsSync(devConfigPath)) {
  try {
    devConfig = JSON.parse(fs.readFileSync(devConfigPath, 'utf8'));
  } catch (e) {}
}

let mainWindow;
let splashWindow;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile('splash.html');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    transparent: true,
    resizable: true,
    show: false, // Start hidden to let ready-to-show transition smoothly
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', async () => {
    try {
      // 1. Check if we should search for updates (bypass if local developer mode is active)
      const isDev = devConfig && devConfig.isDeveloper;
      if (!isDev) {
        if (splashWindow) {
          splashWindow.webContents.executeJavaScript(`if(document.querySelector('.loading-status')) document.querySelector('.loading-status').textContent = 'Sprawdzanie aktualizacji...';`);
        }
        
        const updateInfo = await checkForUpdates();
        if (updateInfo) {
          if (splashWindow) {
            splashWindow.webContents.executeJavaScript(`if(document.querySelector('.loading-status')) document.querySelector('.loading-status').textContent = 'Pobieranie aktualizacji (0%)...';`);
          }
          
          const tempDir = app.getPath('temp');
          const destPath = path.join(tempDir, 'gg-launcher-setup-update.exe');
          
          // Download the installer
          await downloadUpdateFile(updateInfo.downloadUrl, destPath, (percent) => {
            if (splashWindow) {
              splashWindow.webContents.executeJavaScript(`if(document.querySelector('.loading-status')) document.querySelector('.loading-status').textContent = 'Pobieranie aktualizacji (${percent}%)...';`);
            }
          });
          
          if (splashWindow) {
            splashWindow.webContents.executeJavaScript(`if(document.querySelector('.loading-status')) document.querySelector('.loading-status').textContent = 'Uruchamianie instalatora...';`);
          }
          
          // Execute installer
          const { spawn } = require('child_process');
          const child = spawn(destPath, [], { detached: true, stdio: 'ignore' });
          child.unref();
          app.quit();
          return;
        }
      }
    } catch (err) {
      console.error('Błąd aktualizacji:', err);
      if (splashWindow) {
        splashWindow.webContents.executeJavaScript(`if(document.querySelector('.loading-status')) document.querySelector('.loading-status').textContent = 'Błąd aktualizacji, uruchamianie...';`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }

    // Show splash screen for 1.8 seconds, then reveal the main window
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
    }, 1800);
  });
}

app.whenReady().then(() => {
  createSplashWindow();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Window Controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});


// Directory Selection
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});

// Gemini AI Chat – called from renderer, executes in main process
ipcMain.handle('gemini-chat', async (event, { apiKey, model, history, systemPrompt }) => {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: history,
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      safetySettings: [
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
      ]
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error?.message || `HTTP ${res.status}` };
    }
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || '(Brak odpowiedzi)';
    return { success: true, reply };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Helper to create a valid JAR / ZIP buffer in pure Node.js
function createSimpleJar(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    crcTable[i] = c;
  }

  function calcCrc(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xFF];
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  for (const f of files) {
    const pBuf = Buffer.from(f.path.replace(/\\/g, '/'), 'utf8');
    const dBuf = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8');
    const crc = calcCrc(dBuf);

    const lh = Buffer.alloc(30 + pBuf.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(dBuf.length, 18);
    lh.writeUInt32LE(dBuf.length, 22);
    lh.writeUInt16LE(pBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    pBuf.copy(lh, 30);

    localHeaders.push(lh, dBuf);

    const ch = Buffer.alloc(46 + pBuf.length);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(dBuf.length, 20);
    ch.writeUInt32LE(dBuf.length, 24);
    ch.writeUInt16LE(pBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    pBuf.copy(ch, 46);

    centralHeaders.push(ch);
    offset += lh.length + dBuf.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  centralHeaders.forEach(h => cdSize += h.length);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

// Install AI Generated Playable Mod directly into mods directory as a real .jar file
ipcMain.handle('install-ai-mod', async (event, options) => {
  try {
    const { gameDirectory, modName, code, loader } = options;
    const gameRoot = gameDirectory || path.join(app.getPath('appData'), '.minecraft');
    
    const sanitizedName = (modName || 'GG_AI_Mod').replace(/[^a-zA-Z0-9_-]/g, '_');
    const modId = sanitizedName.toLowerCase();
    const modsDir = path.join(gameRoot, 'mods');
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });
    
    const jarFileName = `${sanitizedName}.jar`;
    const jarPath = path.join(modsDir, jarFileName);
    
    const isFabric = (loader || '').toLowerCase().includes('fabric');
    const isForge = (loader || '').toLowerCase().includes('forge');
    
    const filesInJar = [];
    
    if (isFabric) {
      const fabricModJson = {
        schemaVersion: 1,
        id: modId,
        version: '1.0.0',
        name: modName || 'GG AI Mod',
        description: 'Grywalny mod stworzony przez GG AI w GG Launcher',
        authors: ['GG AI'],
        contact: {},
        license: 'MIT',
        icon: 'assets/icon.png',
        environment: '*'
      };
      filesInJar.push({ path: 'fabric.mod.json', content: JSON.stringify(fabricModJson, null, 2) });
    } else {
      const modsToml = `modLoader="lowcodefml"
loaderVersion="[36,)"
issueTrackerURL="https://ggnetwork.pl"
license="MIT"
[[mods]]
modId="${modId}"
version="1.0.0"
displayName="${modName || 'GG AI Mod'}"
authors="GG AI"
license="MIT"
description='''Grywalny mod stworzony przez GG AI w GG Launcher'''
`;
      filesInJar.push({ path: 'META-INF/mods.toml', content: modsToml });
    }
    
    // Include mod source/script inside jar
    filesInJar.push({ path: `com/ggai/mod/${sanitizedName}.java`, content: code });
    filesInJar.push({ path: `assets/${modId}/lang/en_us.json`, content: JSON.stringify({ [`item.${modId}.custom`]: modName || 'GG AI Mod' }) });
    
    // Include AI generated assets (textures, models, blockstates)
    if (options.generatedAssets && Array.isArray(options.generatedAssets)) {
      for (const asset of options.generatedAssets) {
        const { type, id, base64 } = asset;
        const buffer = Buffer.from(base64, 'base64');
        
        if (type === 'item') {
          // Texture
          filesInJar.push({ path: `assets/${modId}/textures/item/${id}.png`, content: buffer });
          // Item Model
          filesInJar.push({
            path: `assets/${modId}/models/item/${id}.json`,
            content: JSON.stringify({
              parent: "item/generated",
              textures: { layer0: `${modId}:item/${id}` }
            }, null, 2)
          });
        } else if (type === 'block') {
          // Texture
          filesInJar.push({ path: `assets/${modId}/textures/block/${id}.png`, content: buffer });
          // Block Model
          filesInJar.push({
            path: `assets/${modId}/models/block/${id}.json`,
            content: JSON.stringify({
              parent: "block/cube_all",
              textures: { all: `${modId}:block/${id}` }
            }, null, 2)
          });
          // Item Model (inventory block)
          filesInJar.push({
            path: `assets/${modId}/models/item/${id}.json`,
            content: JSON.stringify({
              parent: `${modId}:block/${id}`
            }, null, 2)
          });
          // Blockstate
          filesInJar.push({
            path: `assets/${modId}/blockstates/${id}.json`,
            content: JSON.stringify({
              variants: { "": { model: `${modId}:block/${id}` } }
            }, null, 2)
          });
        }
      }
    }
    
    const jarBuffer = createSimpleJar(filesInJar);
    fs.writeFileSync(jarPath, jarBuffer);
    
    return { success: true, message: `Pomyślnie utworzono i zainstalowano grywalny plik modu '${jarFileName}' w folderze mods!` };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Fetch skin image and convert to base64 to bypass renderer CORS
ipcMain.handle('fetch-image-base64', async (event, url) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = res.headers.get('content-type') || 'image/png';
    return { success: true, base64: `data:${mimeType};base64,${buffer.toString('base64')}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
});






// Fetch Premium Profile UUID from Mojang API
ipcMain.handle('get-premium-uuid', async (event, username) => {
  try {
    const response = await fetch(`https://api.mojang.com/users/profiles/minecraft/${username}`);
    if (response.status === 200) {
      const data = await response.json();
      return { exists: true, uuid: data.id, name: data.name };
    }
    return { exists: false, uuid: null };
  } catch (err) {
    return { exists: false, uuid: null, error: err.message };
  }
});

// Save Custom Skin File and create Resource Pack
ipcMain.handle('save-custom-skin', async (event, options) => {
  try {
    const { gameDirectory, skinBase64, gameVersion } = options;
    const gameRoot = gameDirectory || path.join(app.getPath('appData'), '.minecraft');
    
    const rpDir = path.join(gameRoot, 'resourcepacks', 'GG_Launcher_Skins');
    const entityDir = path.join(rpDir, 'assets', 'minecraft', 'textures', 'entity');
    const playerWideDir = path.join(entityDir, 'player', 'wide');
    const playerSlimDir = path.join(entityDir, 'player', 'slim');
    
    // Create all required directories for legacy and modern Minecraft versions
    [entityDir, playerWideDir, playerSlimDir].forEach(d => {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });
    
    // Strip data URL header and convert to binary buffer
    const base64Data = skinBase64.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Write skin textures to all possible paths (legacy 1.12-1.18 and modern 1.19+)
    const defaultSkinNames = ['steve.png', 'alex.png', 'ari.png', 'efe.png', 'kai.png', 'makena.png', 'noor.png', 'sunny.png', 'zuri.png'];
    defaultSkinNames.forEach(name => {
      fs.writeFileSync(path.join(entityDir, name), buffer);
      fs.writeFileSync(path.join(playerWideDir, name), buffer);
      fs.writeFileSync(path.join(playerSlimDir, name), buffer);
    });
    
    let packFormat = 15;
    if (gameVersion) {
      if (gameVersion.startsWith('1.8') || gameVersion.startsWith('1.9') || gameVersion.startsWith('1.10')) packFormat = 2;
      else if (gameVersion.startsWith('1.11') || gameVersion.startsWith('1.12')) packFormat = 3;
      else if (gameVersion.startsWith('1.13') || gameVersion.startsWith('1.14')) packFormat = 4;
      else if (gameVersion.startsWith('1.15')) packFormat = 5;
      else if (gameVersion.startsWith('1.16')) packFormat = 6;
      else if (gameVersion.startsWith('1.17')) packFormat = 7;
      else if (gameVersion.startsWith('1.18')) packFormat = 8;
      else if (gameVersion.startsWith('1.19.1') || gameVersion.startsWith('1.19.2')) packFormat = 9;
      else if (gameVersion.startsWith('1.19')) packFormat = 15;
      else if (gameVersion.startsWith('1.20.5') || gameVersion.startsWith('1.20.6')) packFormat = 32;
      else if (gameVersion.startsWith('1.20.3') || gameVersion.startsWith('1.20.4')) packFormat = 22;
      else if (gameVersion.startsWith('1.20.2')) packFormat = 18;
      else if (gameVersion.startsWith('1.20')) packFormat = 15;
      else if (gameVersion.startsWith('1.21')) packFormat = 34;
    }

    // Write pack.mcmeta with compatible pack format
    const mcmeta = {
      pack: {
        pack_format: packFormat,
        description: 'GG Launcher Custom Skin Pack'
      }
    };
    fs.writeFileSync(path.join(rpDir, 'pack.mcmeta'), JSON.stringify(mcmeta, null, 2));
    
    // Auto-enable the Resource Pack in options.txt if it exists
    const optionsPath = path.join(gameRoot, 'options.txt');
    if (fs.existsSync(optionsPath)) {
      let content = fs.readFileSync(optionsPath, 'utf8');
      const lines = content.split(/\r?\n/);
      let found = false;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('resourcePacks:')) {
          found = true;
          const jsonStr = lines[i].slice(14).trim();
          try {
            let packs = JSON.parse(jsonStr);
            if (!Array.isArray(packs)) packs = [];
            
            // Wyczyść ewentualne stare wpisy z naszą paczką
            packs = packs.filter(p => !p.includes('GG_Launcher_Skins'));
            
            // W Minecraft paczki o najwyższym priorytecie znajdują się na końcu listy (overriding)
            packs.push("file/GG_Launcher_Skins");
            
            // Upewnij się, że "vanilla" jest zawsze jako pierwsze na liście (baza)
            if (packs.includes("vanilla")) {
              packs = packs.filter(p => p !== "vanilla");
              packs.unshift("vanilla");
            }
            
            lines[i] = 'resourcePacks:' + JSON.stringify(packs);
          } catch (e) {
            // Bezpieczny fallback w przypadku uszkodzonego formatu JSON w starych wersjach
            if (!lines[i].includes('GG_Launcher_Skins')) {
              lines[i] = 'resourcePacks:["vanilla","file/GG_Launcher_Skins"]';
            }
          }
          break;
        } else if (lines[i].startsWith('incompatibleResourcePacks:')) {
          let val = lines[i].substring(lines[i].indexOf(':') + 1);
          try {
            let parsed = JSON.parse(val);
            parsed = parsed.filter(p => p !== 'file/GG_Launcher_Skins');
            lines[i] = `incompatibleResourcePacks:${JSON.stringify(parsed)}`;
          } catch (e) {}
        }
      }
      
      if (!found) {
        lines.push('resourcePacks:["vanilla","file/GG_Launcher_Skins"]');
      }
      
      fs.writeFileSync(optionsPath, lines.join('\n'), 'utf8');
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Upload Skin to online hosting (tmpfiles.org) for SkinsRestorer / multiplayer support
ipcMain.handle('upload-skin-online', async (event, base64) => {
  try {
    const base64Data = base64.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Create FormData and Blob natively (supported in Node 18/20+)
    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'image/png' });
    formData.append('file', blob, 'skin.png');
    
    const response = await fetch('https://tmpfiles.org/api/v1/upload', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Błąd serwera hostingowego (status: ${response.status})`);
    }
    
    const resJson = await response.json();
    if (resJson.status === 'success' && resJson.data && resJson.data.url) {
      // Direct URL conversion: replace tmpfiles.org/ with tmpfiles.org/dl/
      const uploadUrl = resJson.data.url;
      const directUrl = uploadUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      return { success: true, url: directUrl };
    } else {
      throw new Error(resJson.message || 'Niepoprawny format odpowiedzi serwera tmpfiles.org');
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Version comparison helper for Forge/NeoForge version resolution
function compareVersions(v1, v2) {
  const parts1 = v1.split(/[-.+]/).map(x => isNaN(x) ? x : parseInt(x));
  const parts2 = v2.split(/[-.+]/).map(x => isNaN(x) ? x : parseInt(x));
  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const p1 = parts1[i];
    const p2 = parts2[i];
    if (p1 === undefined) return -1;
    if (p2 === undefined) return 1;
    if (typeof p1 === 'number' && typeof p2 === 'number') {
      if (p1 !== p2) return p1 - p2;
    } else {
      const s1 = String(p1);
      const s2 = String(p2);
      if (s1 !== s2) return s1.localeCompare(s2);
    }
  }
  return 0;
}

// Download Mods into the profile's mods directory
ipcMain.handle('download-mods', async (event, options) => {
  try {
    const { gameDirectory, mods, loaderType, gameVersion } = options;
    const gameRoot = gameDirectory || path.join(app.getPath('appData'), '.minecraft');
    const modsDir = path.join(gameRoot, 'mods');
    
    if (!fs.existsSync(modsDir)) {
      fs.mkdirSync(modsDir, { recursive: true });
    } else {
      // Clear existing jar files to avoid conflicts between different modpacks
      if (mainWindow) mainWindow.webContents.send('launch-logs', '[MODPACK] Czyszczenie folderu mods...');
      const files = fs.readdirSync(modsDir);
      for (const file of files) {
        if (file.endsWith('.jar') && !file.includes('GG_AI_Mod')) {
          try {
            fs.unlinkSync(path.join(modsDir, file));
          } catch (e) {
            if (mainWindow) mainWindow.webContents.send('launch-logs', `[MODPACK OSTRZEŻENIE] Nie udało się usunąć ${file}: ${e.message}`);
          }
        }
      }
    }

    let finalMods = [...mods];

    // Automatically fetch and deploy Fabric API mod for Fabric loader
    if (loaderType === 'Fabric' && gameVersion) {
      if (mainWindow) mainWindow.webContents.send('launch-logs', `[MODPACK] Wyszukiwanie Fabric API dla wersji ${gameVersion} na Modrinth...`);
      try {
        const modrinthUrl = `https://api.modrinth.com/v2/project/fabric-api/version?game_versions=["${gameVersion}"]&loaders=["fabric"]`;
        const res = await fetch(modrinthUrl, { headers: { 'User-Agent': 'Antigravity/GG-Launcher/1.0.0 (contact@example.com)' } });
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            const latest = data[0];
            const file = latest.files.find(f => f.primary) || latest.files[0];
            finalMods.push({
              name: 'Fabric API',
              url: file.url,
              filename: file.filename
            });
            if (mainWindow) mainWindow.webContents.send('launch-logs', `[MODPACK] Dodano automatycznie Fabric API: ${file.filename}`);
          }
        }
      } catch (err) {
        if (mainWindow) mainWindow.webContents.send('launch-logs', `[MODPACK OSTRZEŻENIE] Nie udało się automatycznie pobrać Fabric API: ${err.message}`);
      }
    }
    
    for (const mod of finalMods) {
      if (!mod.url || !mod.filename) continue;
      const destPath = path.join(modsDir, mod.filename);
      
      if (fs.existsSync(destPath)) {
        if (mainWindow) mainWindow.webContents.send('launch-logs', `[MODPACK] Mod ${mod.name} jest już zainstalowany.`);
        continue;
      }
      
      if (mainWindow) mainWindow.webContents.send('launch-logs', `[MODPACK] Pobieranie: ${mod.name}...`);
      
      try {
        const response = await fetch(mod.url, { headers: { 'User-Agent': 'Antigravity/GG-Launcher/1.0.0 (contact@example.com)' } });
        if (!response.ok) {
          throw new Error(`Błąd HTTP ${response.status}`);
        }
        
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(destPath, buffer);
        
        if (mainWindow) mainWindow.webContents.send('launch-logs', `[MODPACK] Pobrano mod: ${mod.name}!`);
      } catch (dlErr) {
        if (mainWindow) mainWindow.webContents.send('launch-logs', `[MODPACK OSTRZEŻENIE] Nie udało się pobrać ${mod.name}: ${dlErr.message} - pominięto`);
      }
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Install custom mod loaders (Fabric, Forge, NeoForge)
ipcMain.handle('install-loader', async (event, options) => {
  try {
    const { gameDirectory, loaderType, gameVersion, javaPath } = options;
    const gameRoot = gameDirectory || path.join(app.getPath('appData'), '.minecraft');
    
    if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Rozpoczynanie weryfikacji silnika ${loaderType} dla wersji ${gameVersion}...`);

    if (loaderType === 'Vanilla') {
      return { success: true, versionId: gameVersion };
    }

    if (loaderType === 'Fabric') {
      if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Pobieranie listy wersji Fabric dla ${gameVersion}...`);
      const listRes = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${gameVersion}`);
      if (!listRes.ok) throw new Error(`Nie udało się pobrać wersji Fabric: ${listRes.statusText}`);
      const loaders = await listRes.json();
      if (!loaders || loaders.length === 0) throw new Error(`Brak dostępnych wersji Fabric dla Minecraft ${gameVersion}`);

      const loaderVersion = loaders[0].loader.version;
      const versionName = `fabric-loader-${loaderVersion}-${gameVersion}`;
      const versionDir = path.join(gameRoot, 'versions', versionName);
      const jsonPath = path.join(versionDir, `${versionName}.json`);

      if (fs.existsSync(jsonPath)) {
        if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Fabric Loader ${loaderVersion} jest już zainstalowany.`);
        return { success: true, versionId: versionName };
      }

      if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Pobieranie profilu Fabric Loader ${loaderVersion}...`);
      const profileRes = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${loaderVersion}/profile/json`);
      if (!profileRes.ok) throw new Error(`Nie udało się pobrać profilu Fabric: ${profileRes.statusText}`);
      const profile = await profileRes.json();

      profile.id = versionName;

      if (!fs.existsSync(versionDir)) {
        fs.mkdirSync(versionDir, { recursive: true });
      }
      fs.writeFileSync(jsonPath, JSON.stringify(profile, null, 2), 'utf8');

      if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Fabric Loader został pomyślnie zainstalowany!`);
      return { success: true, versionId: versionName };
    }

    if (loaderType === 'Forge') {
      if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Sprawdzanie dostępności Forge dla ${gameVersion} na Maven...`);
      
      const versionsDir = path.join(gameRoot, 'versions');

      // First check if Forge is already installed (any folder containing 'forge' and the game version, with valid JSON)
      if (fs.existsSync(versionsDir)) {
        const existingFolders = fs.readdirSync(versionsDir);
        const alreadyInstalled = existingFolders.find(f => {
          if (f.toLowerCase().includes('forge') && f.startsWith(gameVersion)) {
            const jsonPath = path.join(versionsDir, f, `${f}.json`);
            return fs.existsSync(jsonPath);
          }
          return false;
        });
        if (alreadyInstalled) {
          if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Forge jest już zainstalowany: ${alreadyInstalled}`);
          return { success: true, versionId: alreadyInstalled };
        }
      }

      let forgeVersion = '';
      try {
        const metadataRes = await fetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
        if (metadataRes.ok) {
          const xml = await metadataRes.text();
          const versions = [];
          const regex = /<version>([^<]+)<\/version>/g;
          let match;
          while ((match = regex.exec(xml)) !== null) {
            versions.push(match[1]);
          }
          const prefix = `${gameVersion}-`;
          const matching = versions.filter(v => v.startsWith(prefix));
          if (matching.length > 0) {
            matching.sort(compareVersions);
            forgeVersion = matching[matching.length - 1];
          }
        }
      } catch (err) {
        if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Błąd odpytywania Maven: ${err.message}. Użycie fallbacku.`);
      }

      // Fallbacks if metadata fetch fails or is empty
      if (!forgeVersion) {
        const fallbacks = {
          '1.20.1': '1.20.1-47.3.0',
          '1.20.4': '1.20.4-49.1.0',
          '1.20.2': '1.20.2-48.1.0',
          '1.20': '1.20-46.0.14',
          '1.19.4': '1.19.4-45.3.0',
          '1.19.3': '1.19.3-44.1.23',
          '1.19.2': '1.19.2-43.3.0',
          '1.19.1': '1.19.1-41.1.0',
          '1.19': '1.19-41.1.0',
          '1.18.2': '1.18.2-40.2.21',
          '1.18.1': '1.18.1-39.1.2',
          '1.17.1': '1.17.1-37.1.1',
          '1.16.5': '1.16.5-36.2.39',
          '1.16.4': '1.16.4-35.1.37',
          '1.15.2': '1.15.2-31.2.57',
          '1.12.2': '1.12.2-14.23.5.2860',
          '1.7.10': '1.7.10-10.13.4.1614-1.7.10'
        };
        forgeVersion = fallbacks[gameVersion];
      }

      if (!forgeVersion) {
        throw new Error(`Nie udało się automatycznie dopasować wersji Forge dla Minecraft ${gameVersion}`);
      }

      const versionPart = forgeVersion.substring(gameVersion.length + 1);
      const versionName = `${gameVersion}-forge-${versionPart}`;

      if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Pobieranie instalatora Forge: ${forgeVersion}...`);
      const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`;
      
      const tempDir = path.join(gameRoot, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const installerPath = path.join(tempDir, `forge-${forgeVersion}-installer.jar`);
      const downloadRes = await fetch(installerUrl);
      if (!downloadRes.ok) throw new Error(`Błąd pobierania instalatora Forge: ${downloadRes.statusText}`);
      fs.writeFileSync(installerPath, Buffer.from(await downloadRes.arrayBuffer()));

      const profilesPath = path.join(gameRoot, 'launcher_profiles.json');
      if (!fs.existsSync(profilesPath)) {
        fs.writeFileSync(profilesPath, JSON.stringify({ profiles: {} }), 'utf8');
      }

      // Snapshot folders before install to detect what Forge creates
      const foldersBefore = fs.existsSync(versionsDir) ? fs.readdirSync(versionsDir) : [];

      if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Uruchamianie instalatora Forge w tle (może to zająć chwilę)...`);
      
      let javaExe = 'java';
      if (javaPath && javaPath.trim() !== '') {
        javaExe = javaPath.trim().replace(/javaw\.exe$/i, 'java.exe').replace(/javaw$/i, 'java');
      }
      
      await new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const child = spawn(javaExe, ['-jar', installerPath, '--installClient', gameRoot], {
          cwd: tempDir
        });

        child.stdout.on('data', (data) => {
          if (mainWindow) mainWindow.webContents.send('launch-logs', `[FORGE] ${data.toString().trim()}`);
        });

        child.stderr.on('data', (data) => {
          if (mainWindow) mainWindow.webContents.send('launch-logs', `[FORGE ERR] ${data.toString().trim()}`);
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Instalator Forge zakończył z kodem: ${code}`));
          }
        });

        child.on('error', (err) => {
          reject(new Error(`Nie można uruchomić Java: ${err.message}. Sprawdź ścieżkę do Java w Ustawieniach.`));
        });
      });

      try { if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath); } catch (e) {}

      // Detect which folder Forge created
      const foldersAfter = fs.existsSync(versionsDir) ? fs.readdirSync(versionsDir) : [];
      const newFolders = foldersAfter.filter(f => !foldersBefore.includes(f));
      let finalForgeVersion = versionName;
      if (newFolders.length > 0) {
        finalForgeVersion = newFolders[0];
      } else {
        const matchedFolder = foldersAfter.find(f =>
          f.toLowerCase().includes('forge') && f.startsWith(gameVersion)
        );
        if (matchedFolder) finalForgeVersion = matchedFolder;
      }

      if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Forge zainstalowany! Wersja: ${finalForgeVersion}`);
      return { success: true, versionId: finalForgeVersion };
    }

    if (loaderType === 'NeoForge') {
      if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Sprawdzanie dostępności NeoForge dla ${gameVersion} na Maven...`);

      const versionParts = gameVersion.split('.');
      const major = versionParts[1];
      const minor = versionParts[2] || '0';
      const prefix = `${major}.${minor}.`;

      let neoVersion = '';
      let isOldNeo = gameVersion === '1.20.1';

      try {
        const metadataUrl = isOldNeo 
          ? 'https://maven.neoforged.net/releases/net/neoforged/forge/maven-metadata.xml'
          : 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';

        const metadataRes = await fetch(metadataUrl);
        if (metadataRes.ok) {
          const xml = await metadataRes.text();
          const versions = [];
          const regex = /<version>([^<]+)<\/version>/g;
          let match;
          while ((match = regex.exec(xml)) !== null) {
            versions.push(match[1]);
          }

          const filterPrefix = isOldNeo ? '1.20.1-' : prefix;
          const matching = versions.filter(v => v.startsWith(filterPrefix));
          if (matching.length > 0) {
            matching.sort(compareVersions);
            neoVersion = matching[matching.length - 1];
          }
        }
      } catch (err) {
        if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Błąd odpytywania Maven NeoForge: ${err.message}. Użycie fallbacku.`);
      }

      if (!neoVersion) {
        const fallbacks = {
          '1.20.1': '1.20.1-47.1.106',
          '1.20.4': '20.4.250',
          '1.20.6': '20.6.139',
          '1.21': '21.0.167',
          '1.21.1': '21.1.233'
        };
        neoVersion = fallbacks[gameVersion];
      }

      if (!neoVersion) {
        throw new Error(`Nie udało się automatycznie dopasować wersji NeoForge dla Minecraft ${gameVersion}`);
      }

      const versionNameFallback = isOldNeo 
        ? `1.20.1-neoforge-${neoVersion.substring(9)}` 
        : `neoforge-${neoVersion}`;
      
      const versionsDir = path.join(gameRoot, 'versions');
      let foundVersionName = '';

      if (fs.existsSync(versionsDir)) {
        const folders = fs.readdirSync(versionsDir);
        const matchStr = isOldNeo ? neoVersion.substring(9) : neoVersion;
        const matchedFolder = folders.find(f => {
          if (f.toLowerCase().includes('neoforge') && f.includes(matchStr)) {
            const jsonPath = path.join(versionsDir, f, `${f}.json`);
            return fs.existsSync(jsonPath);
          }
          return false;
        });
        if (matchedFolder) {
          foundVersionName = matchedFolder;
        }
      }

      if (foundVersionName) {
        if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] NeoForge ${neoVersion} jest już zainstalowany.`);
        return { success: true, versionId: foundVersionName };
      }

      if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Pobieranie instalatora NeoForge: ${neoVersion}...`);
      
      const installerUrl = isOldNeo
        ? `https://maven.neoforged.net/releases/net/neoforged/forge/${neoVersion}/forge-${neoVersion}-installer.jar`
        : `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`;

      const tempDir = path.join(gameRoot, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const installerPath = path.join(tempDir, `neoforge-${neoVersion}-installer.jar`);
      const downloadRes = await fetch(installerUrl);
      if (!downloadRes.ok) throw new Error(`Błąd pobierania instalatora NeoForge: ${downloadRes.statusText}`);
      fs.writeFileSync(installerPath, Buffer.from(await downloadRes.arrayBuffer()));

      const profilesPath = path.join(gameRoot, 'launcher_profiles.json');
      if (!fs.existsSync(profilesPath)) {
        fs.writeFileSync(profilesPath, JSON.stringify({ profiles: {} }), 'utf8');
      }

      const foldersBefore = fs.existsSync(versionsDir) ? fs.readdirSync(versionsDir) : [];

      if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] Uruchamianie instalatora NeoForge w tle (może to zająć chwilę)...`);
      
      let javaExe = 'java';
      if (javaPath && javaPath.trim() !== '') {
        javaExe = javaPath.trim().replace(/javaw\.exe$/i, 'java.exe').replace(/javaw$/i, 'java');
      }

      await new Promise((resolve, reject) => {
        const { spawn } = require('child_process');
        const child = spawn(javaExe, ['-jar', installerPath, '--installClient', gameRoot], {
          cwd: tempDir
        });

        child.stdout.on('data', (data) => {
          if (mainWindow) mainWindow.webContents.send('launch-logs', `[NEOFORGE] ${data.toString().trim()}`);
        });

        child.stderr.on('data', (data) => {
          if (mainWindow) mainWindow.webContents.send('launch-logs', `[NEOFORGE ERROR] ${data.toString().trim()}`);
        });

        child.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Instalator NeoForge zakończył działanie z kodem błędu: ${code}`));
          }
        });
      });

      try {
        if (fs.existsSync(installerPath)) {
          fs.unlinkSync(installerPath);
        }
      } catch (e) {}

      const foldersAfter = fs.existsSync(versionsDir) ? fs.readdirSync(versionsDir) : [];
      const newFolders = foldersAfter.filter(f => !foldersBefore.includes(f));
      
      let finalVersionName = versionNameFallback;
      if (newFolders.length > 0) {
        finalVersionName = newFolders[0];
      } else {
        const matchStr = isOldNeo ? neoVersion.substring(9) : neoVersion;
        const matchedFolder = foldersAfter.find(f => f.toLowerCase().includes('neoforge') && f.includes(matchStr));
        if (matchedFolder) {
          finalVersionName = matchedFolder;
        }
      }

      if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER] NeoForge został pomyślnie zainstalowany!`);
      return { success: true, versionId: finalVersionName };
    }

    throw new Error(`Nieznany typ silnika: ${loaderType}`);
  } catch (err) {
    if (mainWindow) mainWindow.webContents.send('launch-logs', `[LOADER OSTRZEŻENIE] Błąd podczas instalacji silnika: ${err.message}`);
    return { success: false, error: err.message };
  }
});


// ─── Helper: Maven coordinate → relative file path ───────────────────────────
function mavenToRelPath(name) {
  const parts = name.split(':');
  const group = parts[0].replace(/\./g, '/');
  const artifact = parts[1];
  const version = parts[2];
  const classifier = parts[3];
  const fileName = classifier
    ? `${artifact}-${version}-${classifier}.jar`
    : `${artifact}-${version}.jar`;
  return [group, artifact, version, fileName].join('/');
}

// ─── Helper: download file from URL ──────────────────────────────────────────
async function downloadFileTo(url, destPath) {
  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

// ─── Custom modded launcher (Forge / NeoForge / Fabric) ─────────────────────
async function launchModded(opts) {
  const { version, username, uuid, maxMemory, minMemory, javaPath, width, height } = opts;
  let { gameRoot } = opts;

  const log = (msg) => { if (mainWindow) mainWindow.webContents.send('launch-logs', msg); };
  const status = (msg) => { if (mainWindow) mainWindow.webContents.send('launch-status', msg); };

  // Auto-detect correct gameRoot: try provided dir, then default .minecraft
  const defaultMinecraft = path.join(app.getPath('appData'), '.minecraft');
  const candidateDirs = [];
  if (gameRoot && gameRoot.trim() !== '') candidateDirs.push(gameRoot.trim());
  candidateDirs.push(defaultMinecraft);

  // Find which directory actually contains this Forge version
  let resolvedRoot = null;
  for (const candidate of candidateDirs) {
    const check = path.join(candidate, 'versions', version, `${version}.json`);
    log(`[MOD] Szukam wersji w: ${check}`);
    if (fs.existsSync(check)) {
      resolvedRoot = candidate;
      log(`[MOD] Znaleziono profil w: ${candidate}`);
      break;
    }
  }

  if (!resolvedRoot) {
    // List available versions for debugging
    for (const candidate of candidateDirs) {
      const vDir = path.join(candidate, 'versions');
      if (fs.existsSync(vDir)) {
        const folders = fs.readdirSync(vDir);
        log(`[MOD DIAGNOZA] Dostępne wersje w ${candidate}: ${folders.join(', ') || '(brak)'}`);
      } else {
        log(`[MOD DIAGNOZA] Folder versions nie istnieje: ${vDir}`);
      }
    }
    throw new Error(
      `Nie znaleziono zainstalowanego loadera: ${version}\n` +
      `Sprawdzone katalogi: ${candidateDirs.join(', ')}\n` +
      `Upewnij się, że folder gry w Ustawieniach wskazuje na właściwy .minecraft`
    );
  }

  gameRoot = resolvedRoot;
  const versionsDir = path.join(gameRoot, 'versions');
  const librariesDir = path.join(gameRoot, 'libraries');
  const assetsDir    = path.join(gameRoot, 'assets');

  // 1. Load mod version JSON
  const modJsonPath = path.join(versionsDir, version, `${version}.json`);
  const modJson = JSON.parse(fs.readFileSync(modJsonPath, 'utf8'));
  log(`[MOD] Wczytano profil: ${modJson.id}`);
  log(`[MOD] Katalog gry: ${gameRoot}`);

  // 2. Fetch / load vanilla JSON (inheritsFrom)
  let vanillaJson = null;
  const baseVer = modJson.inheritsFrom;
  if (baseVer) {
    status(`Sprawdzanie Minecraft ${baseVer}...`);
    const vanillaJsonPath = path.join(versionsDir, baseVer, `${baseVer}.json`);
    if (!fs.existsSync(vanillaJsonPath)) {
      log(`[MOD] Pobieranie profilu Minecraft ${baseVer}...`);
      const mfRes = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
      const mf = await mfRes.json();
      const vi = mf.versions.find(v => v.id === baseVer);
      if (!vi) throw new Error(`Nie znaleziono Minecraft ${baseVer} w manifeście Mojang.`);
      const vRes = await fetch(vi.url);
      const vData = await vRes.json();
      const vDir = path.join(versionsDir, baseVer);
      if (!fs.existsSync(vDir)) fs.mkdirSync(vDir, { recursive: true });
      fs.writeFileSync(vanillaJsonPath, JSON.stringify(vData, null, 2));
      vanillaJson = vData;
    } else {
      vanillaJson = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf8'));
    }
    log(`[MOD] Baza: Minecraft ${baseVer}`);
  }

  // 3. Merge vanilla + mod JSON
  const merged = vanillaJson ? { ...vanillaJson, ...modJson } : { ...modJson };
  if (vanillaJson) {
    merged.libraries = [...(vanillaJson.libraries || []), ...(modJson.libraries || [])];
    if (!modJson.assetIndex)     merged.assetIndex = vanillaJson.assetIndex;
    if (!modJson.assets)         merged.assets     = vanillaJson.assets;
    if (!modJson.downloads)      merged.downloads  = vanillaJson.downloads;
    if (vanillaJson.arguments && modJson.arguments) {
      merged.arguments = {
        game: [...(vanillaJson.arguments.game || []), ...(modJson.arguments.game || [])],
        jvm:  [...(vanillaJson.arguments.jvm  || []), ...(modJson.arguments.jvm  || [])]
      };
    } else if (vanillaJson.arguments) {
      merged.arguments = vanillaJson.arguments;
    }
  }

  // 4. Download vanilla client JAR
  let clientJarPath = '';
  if (baseVer) {
    clientJarPath = path.join(versionsDir, baseVer, `${baseVer}.jar`);
    if (!fs.existsSync(clientJarPath) && merged.downloads?.client?.url) {
      status(`Pobieranie Minecraft ${baseVer}.jar...`);
      log(`[MOD] Pobieranie ${baseVer}.jar...`);
      await downloadFileTo(merged.downloads.client.url, clientJarPath);
    }
  }

  // 5. Download libraries and build classpath
  status('Pobieranie bibliotek...');
  log('[MOD] Sprawdzanie bibliotek...');
  const classpath = [];
  const FORGE_MAVEN = 'https://maven.minecraftforge.net/';
  const MC_LIBS    = 'https://libraries.minecraft.net/';
  const NEO_MAVEN  = 'https://maven.neoforged.net/releases/';

  for (const lib of (merged.libraries || [])) {
    // Check OS rules
    if (lib.rules) {
      const blocked = lib.rules.some(r =>
        r.action === 'disallow' && (!r.os || r.os.name === 'windows')
      );
      if (blocked) continue;
      const hasAllow = lib.rules.some(r => r.action === 'allow');
      if (hasAllow) {
        const allowed = lib.rules.some(r =>
          r.action === 'allow' && (!r.os || r.os.name === 'windows')
        );
        if (!allowed) continue;
      }
    }

    let libPath = '';
    let libUrl  = '';

    if (lib.downloads?.artifact) {
      const art = lib.downloads.artifact;
      libPath = path.join(librariesDir, art.path.replace(/\//g, path.sep));
      libUrl  = art.url;
    } else if (lib.name) {
      const rel = mavenToRelPath(lib.name);
      libPath = path.join(librariesDir, rel.replace(/\//g, path.sep));
      if (lib.url) {
        libUrl = lib.url.endsWith('/') ? lib.url + rel : lib.url + '/' + rel;
      } else {
        libUrl = MC_LIBS + rel;
      }
    }

    if (!libPath) continue;

    if (!fs.existsSync(libPath) && libUrl) {
      try {
        log(`[MOD] Pobieranie: ${path.basename(libPath)}`);
        await downloadFileTo(libUrl, libPath);
      } catch {
        // Try alternative Maven repos as fallback
        let downloaded = false;
        for (const base of [FORGE_MAVEN, NEO_MAVEN, MC_LIBS]) {
          if (lib.name) {
            try {
              const rel = mavenToRelPath(lib.name);
              await downloadFileTo(base + rel, libPath);
              downloaded = true;
              break;
            } catch { /* try next */ }
          }
        }
        if (!downloaded) {
          log(`[MOD WARN] Pominięto (brak): ${path.basename(libPath)}`);
          continue;
        }
      }
    }

    if (fs.existsSync(libPath) && libPath.endsWith('.jar')) {
      classpath.push(libPath);
    }
  }

  // Add client JAR last
  // For Forge and NeoForge, we must use the profile JAR (e.g. 1.19.2-forge-43.5.2.jar) on the classpath
  // rather than the vanilla JAR (1.19.2.jar). The profile JAR's filename matches the JVM ignoreList,
  // preventing it from being loaded as a duplicate Java module alongside the ModLauncher-managed 'minecraft' module.
  let classpathJarPath = clientJarPath;
  const isForgeOrNeo = version.toLowerCase().includes('forge') || version.toLowerCase().includes('neoforge');
  if (isForgeOrNeo && clientJarPath && fs.existsSync(clientJarPath)) {
    const customProfileJar = path.join(versionsDir, version, `${version}.jar`);
    if (fs.existsSync(customProfileJar)) {
      classpathJarPath = customProfileJar;
      log(`[MOD] Wykryto Forge/NeoForge. Używam profilowego JAR na classpath: ${path.basename(customProfileJar)}`);
    } else {
      try {
        fs.mkdirSync(path.dirname(customProfileJar), { recursive: true });
        fs.copyFileSync(clientJarPath, customProfileJar);
        classpathJarPath = customProfileJar;
        log(`[MOD] Utworzono kopię vanilla JAR dla profilu Forge/NeoForge: ${path.basename(customProfileJar)}`);
      } catch (err) {
        log(`[MOD OSTRZEŻENIE] Nie udało się utworzyć profilowego JAR, używam vanilla JAR: ${err.message}`);
      }
    }
  }

  if (classpathJarPath && fs.existsSync(classpathJarPath)) {
    classpath.push(classpathJarPath);
  }

  // 6. Download assets index
  if (merged.assetIndex?.url) {
    const idxDir  = path.join(assetsDir, 'indexes');
    const idxPath = path.join(idxDir, `${merged.assetIndex.id}.json`);
    if (!fs.existsSync(idxPath)) {
      status('Pobieranie indeksu zasobów...');
      log('[MOD] Pobieranie indeksu zasobów...');
      await downloadFileTo(merged.assetIndex.url, idxPath);
    }
    // Download missing asset objects (async, batched)
    const index   = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    const objects = Object.values(index.objects || {});
    let missing   = 0;
    for (const obj of objects) {
      const h   = obj.hash;
      const sub = h.substring(0, 2);
      const dst = path.join(assetsDir, 'objects', sub, h);
      if (!fs.existsSync(dst)) missing++;
    }
    if (missing > 0) {
      log(`[MOD] Pobieranie ${missing} brakujących zasobów...`);
      status(`Pobieranie zasobów (${missing})...`);
      let done = 0;
      const BATCH = 20;
      for (let i = 0; i < objects.length; i += BATCH) {
        await Promise.all(objects.slice(i, i + BATCH).map(async obj => {
          const h   = obj.hash;
          const sub = h.substring(0, 2);
          const dst = path.join(assetsDir, 'objects', sub, h);
          if (!fs.existsSync(dst)) {
            try {
              await downloadFileTo(`https://resources.download.minecraft.net/${sub}/${h}`, dst);
              done++;
            } catch { /* skip broken asset */ }
          }
        }));
      }
      log(`[MOD] Pobrano ${done} zasobów.`);
    }
  }

  // 7. Build Java args
  const nativesDir = path.join(gameRoot, 'natives', baseVer || version);
  if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true });
  const cpStr = classpath.join(';');

  // Format UUID with dashes
  let formattedUuid = uuid || '';
  if (formattedUuid && !formattedUuid.includes('-') && formattedUuid.length === 32) {
    formattedUuid = formattedUuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  }
  if (!formattedUuid) formattedUuid = require('crypto').randomUUID();

  const REPLACEMENTS = {
    '${auth_player_name}':    username || 'GG_Player',
    '${version_name}':        version,
    '${game_directory}':      gameRoot,
    '${assets_root}':         assetsDir,
    '${assets_index_name}':   merged.assetIndex?.id || baseVer || version,
    '${auth_uuid}':           formattedUuid,
    '${auth_access_token}':   'dummy_access_token',
    '${user_type}':           'mojang',
    '${version_type}':        'release',
    '${natives_directory}':   nativesDir,
    '${launcher_name}':       'GG-Launcher',
    '${launcher_version}':    '1.0.0',
    '${classpath}':           cpStr,
    '${user_properties}':     '{}',
    '${auth_session}':        'dummy_access_token',
    '${resolution_width}':    String(width  || 1024),
    '${resolution_height}':   String(height || 768),
    '${library_directory}':   librariesDir,
    '${classpath_separator}': path.delimiter,
    '${primary_jar}':         clientJarPath,
    '${libraries_directory}': librariesDir,
  };

  function fillArg(a) {
    if (typeof a !== 'string') return a;
    let s = a;
    for (const [k, v] of Object.entries(REPLACEMENTS)) s = s.split(k).join(v);
    return s;
  }

  function processArgList(list) {
    const out = [];
    for (const a of (list || [])) {
      if (typeof a === 'string') {
        out.push(fillArg(a));
      } else if (a && typeof a === 'object') {
        // Conditional arg
        let ok = true;
        if (a.rules) {
          ok = a.rules.every(r => {
            // Check OS rules
            if (r.os) {
              const osMatch = r.os.name === 'windows';
              if (r.action === 'allow' && !osMatch) return false;
              if (r.action === 'disallow' && osMatch) return false;
            }
            // Check features rules
            if (r.features) {
              if (r.features.is_demo_user !== undefined) {
                // We are not running a demo user
                const isDemo = false;
                if (r.action === 'allow' && !isDemo) return false;
                if (r.action === 'disallow' && isDemo) return false;
              }
              if (r.features.has_custom_resolution !== undefined) {
                const hasRes = !!(width && height);
                if (r.action === 'allow' && !hasRes) return false;
                if (r.action === 'disallow' && hasRes) return false;
              }
            }
            return true;
          });
        }
        if (ok) {
          // Handle BOTH "value" (standard Forge 1.20+) and "values" (Forge 1.19.x / TLauncher JSONs)
          const rawVals = (a.value !== undefined) ? a.value : a.values;
          if (rawVals !== undefined) {
            const vals = Array.isArray(rawVals) ? rawVals : [rawVals];
            vals.forEach(v => { if (v !== undefined) out.push(fillArg(String(v))); });
          }
        }
      }
    }
    return out.filter(Boolean);
  }

  const jvmArgs  = processArgList(merged.arguments?.jvm);
  const gameArgs = merged.arguments?.game
    ? processArgList(merged.arguments.game)
    : (merged.minecraftArguments || '').split(' ').map(fillArg).filter(Boolean);

  // ─── CRITICAL FIX: Module-path vs Classpath conflict ─────────────────────
  // Forge bootstraplauncher requires securejarhandler/bootstraplauncher as
  // NAMED MODULES (on -p module path). If these JARs are also on classpath,
  // Java loads them as "unnamed module" and the named module can't be found.
  // Fix: extract JARs from -p and remove them from classpath.
  const modulePathSet = new Set();
  const pArgIdx = jvmArgs.indexOf('-p');
  if (pArgIdx !== -1 && jvmArgs[pArgIdx + 1]) {
    jvmArgs[pArgIdx + 1].split(path.delimiter).forEach(p => {
      const t = p.trim();
      if (t) {
        modulePathSet.add(path.resolve(t).toLowerCase());
      }
    });
    log(`[MOD] Wykryto ${modulePathSet.size} modułów Java w module-path (będą wykluczone z classpath).`);
  }

  // Rebuild filtered classpath without module-path JARs
  const filteredCp = classpath.filter(p => {
    if (!p) return false;
    return !modulePathSet.has(path.resolve(p).toLowerCase());
  });
  const filteredCpStr = filteredCp.join(path.delimiter);

  // Replace old full-classpath string with filtered classpath in jvmArgs
  const fixedJvmArgs = jvmArgs.map(a => (a === cpStr) ? filteredCpStr : a);

  // Ensure -cp is present for older JSON formats that omit it
  if (!fixedJvmArgs.some(a => a === '-cp' || a === '-classpath')) {
    fixedJvmArgs.push(`-Djava.library.path=${nativesDir}`, '-cp', filteredCpStr);
  }

  // Critical: --add-opens flags needed for Forge/NeoForge on Java 9+
  // Without these, bootstraplauncher crashes with InaccessibleObjectException
  const JAVA_OPENS = [
    '--add-opens', 'java.base/java.lang.invoke=ALL-UNNAMED',
    '--add-opens', 'java.base/java.lang.reflect=ALL-UNNAMED',
    '--add-opens', 'java.base/java.io=ALL-UNNAMED',
    '--add-opens', 'java.base/java.util=ALL-UNNAMED',
    '--add-opens', 'java.base/java.util.jar=ALL-UNNAMED',
    '--add-opens', 'java.base/sun.nio.ch=ALL-UNNAMED',
    '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
    '--add-opens', 'java.base/java.net=ALL-UNNAMED',
    '--add-opens', 'java.base/sun.nio.fs=ALL-UNNAMED',
    '--add-opens', 'java.base/java.nio.file=ALL-UNNAMED',
  ];

  const fullArgs = [
    `-Xmx${maxMemory || '4G'}`,
    `-Xms${minMemory || '1G'}`,
    ...JAVA_OPENS,
    ...fixedJvmArgs,
    merged.mainClass,
    ...gameArgs
  ];

  // 8. Auto-detect correct Java runtime based on Minecraft version requirements
  // Forge 1.19.x requires Java 17 - using system Java 26 causes ConcurrentModificationException
  // Use bundled Minecraft runtimes from official launcher if available
  let javaExe = javaPath?.trim() || '';

  if (!javaExe) {
    // Determine required Java version from vanilla JSON javaVersion field
    const requiredComponent = vanillaJson?.javaVersion?.component || null;
    const requiredMajor = vanillaJson?.javaVersion?.majorVersion || 17;

    const mcRuntimeBase = path.join(app.getPath('appData'), '.minecraft', 'runtime');

    // Priority list: exact component match, then by version
    const runtimeOrder = [];
    if (requiredComponent) runtimeOrder.push(requiredComponent);

    // Add alternatives by major version
    if (requiredMajor <= 17) {
      runtimeOrder.push('java-runtime-gamma', 'java-runtime-beta');
    } else if (requiredMajor <= 21) {
      runtimeOrder.push('java-runtime-delta', 'java-runtime-gamma', 'java-runtime-beta');
    } else {
      runtimeOrder.push('java-runtime-epsilon', 'java-runtime-delta', 'java-runtime-gamma');
    }

    for (const component of runtimeOrder) {
      const candidate = path.join(mcRuntimeBase, component, 'windows', component, 'bin', 'javaw.exe');
      if (fs.existsSync(candidate)) {
        javaExe = candidate;
        log(`[MOD] Automatycznie wybrano Java runtime: ${component} (wymagana Java ${requiredMajor})`);
        break;
      }
    }

    if (!javaExe) {
      javaExe = 'javaw';
      log(`[MOD OSTRZEŻENIE] Nie znaleziono bundlowanej Javy ${requiredMajor}. Używam systemowej javaw. Forge może nie działać!`);
    }
  } else {
    log(`[MOD] Używam Javy z ustawień: ${javaExe}`);
  }

  status('Uruchamianie Minecraft...');
  log(`[MOD] Klasa główna: ${merged.mainClass}`);
  log(`[MOD] Java: ${javaExe}`);
  log(`[MOD] Uruchamianie...`);

  const { spawn } = require('child_process');
  const child = spawn(javaExe, fullArgs, { cwd: gameRoot });

  child.stdout.on('data', d => log(d.toString().trim()));
  child.stderr.on('data', d => log(d.toString().trim()));
  child.on('close', code => {
    if (opts.isModpack) {
      const modsDir = path.join(gameRoot, 'mods');
      if (fs.existsSync(modsDir)) {
        log('[SYSTEM] Czyszczenie modów po zamknięciu modpacka (zero śladów)...');
        const files = fs.readdirSync(modsDir);
        for (const file of files) {
          if (file.endsWith('.jar') && !file.includes('GG_AI_Mod')) {
            try { fs.unlinkSync(path.join(modsDir, file)); } catch(e) {}
          }
        }
      }
    }
    if (mainWindow) mainWindow.webContents.send('launch-finished', { code });
  });
  child.on('error', err => {
    if (mainWindow) mainWindow.webContents.send('launch-error',
      `Nie można uruchomić Java: ${err.message}. Sprawdź ścieżkę Java w Ustawieniach.`);
  });

  return { success: true };
}

// ─── Launch Minecraft Game ────────────────────────────────────────────────────
ipcMain.handle('launch-game', async (event, options) => {
  try {
    const {
      username, uuid, version, maxMemory, minMemory,
      gameDirectory, javaPath, width, height
    } = options;

    const gameRoot = gameDirectory || path.join(app.getPath('appData'), '.minecraft');
    if (!fs.existsSync(gameRoot)) fs.mkdirSync(gameRoot, { recursive: true });

    const versionStr = version || '1.20.1';
    const isModded = (
      versionStr.startsWith('fabric-loader-') ||
      versionStr.toLowerCase().includes('forge') ||
      versionStr.toLowerCase().includes('neoforge')
    );

    if (isModded) {
      if (mainWindow) mainWindow.webContents.send('launch-logs', `[SYSTEM] Uruchamianie modowanej wersji przez dedykowany launchModded: ${versionStr}`);
      return await launchModded({
        version: versionStr,
        username,
        uuid,
        maxMemory,
        minMemory,
        gameRoot,
        javaPath,
        width,
        height,
        isModpack: options.isModpack
      });
    }


    let baseVersion = versionStr;
    const match = versionStr.match(/1\.\d+(\.\d+)?/);
    if (match) {
      baseVersion = match[0];
    }

    const launcher = new Client();

    let formattedUuid = uuid;
    if (formattedUuid && !formattedUuid.includes('-') && formattedUuid.length === 32) {
      formattedUuid = formattedUuid.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    }
    const userUuid = formattedUuid || crypto.randomUUID();

    const authSession = {
      access_token: 'dummy_access_token',
      client_token: 'dummy_client_token',
      uuid: userUuid,
      name: username || 'GG_Player',
      user_properties: '{}',
      meta: { type: 'mojang' }
    };

    const opts = {
      authorization: authSession,
      root: gameRoot,
      version: { number: baseVersion, type: 'release' },
      memory: { max: maxMemory || '4G', min: minMemory || '2G' }
    };
    
    if (isModded) {
      opts.version.custom = versionStr;
      if (mainWindow) mainWindow.webContents.send('launch-logs', `[SYSTEM] Uruchamianie modowanej wersji przez MCLC: ${versionStr}`);
    }

    let finalJavaPath = 'javaw';
    if (javaPath && javaPath.trim() !== '') {
      finalJavaPath = javaPath.trim();
      if (finalJavaPath.endsWith('java.exe')) finalJavaPath = finalJavaPath.replace(/java\.exe$/, 'javaw.exe');
      else if (finalJavaPath.endsWith('java')) finalJavaPath = finalJavaPath.replace(/java$/, 'javaw');
    }
    opts.javaPath = finalJavaPath;

    if (width && height) opts.window = { width: parseInt(width), height: parseInt(height) };

    launcher.on('debug',           e => { if (mainWindow) mainWindow.webContents.send('launch-logs', `[DEBUG] ${e}`); });
    launcher.on('data',            e => { if (mainWindow) mainWindow.webContents.send('launch-logs', e); });
    launcher.on('download-status', e => {
      if (mainWindow) {
        mainWindow.webContents.send('launch-status', `Downloading: ${e.type}`);
        mainWindow.webContents.send('launch-progress', e);
      }
    });
    launcher.on('progress', e => { if (mainWindow) mainWindow.webContents.send('launch-progress', e); });
    launcher.on('close',   e => {
      if (options.isModpack) {
        const modsDir = path.join(gameRoot, 'mods');
        if (fs.existsSync(modsDir)) {
          if (mainWindow) mainWindow.webContents.send('launch-logs', '[SYSTEM] Czyszczenie modów po zamknięciu modpacka w tle (zero śladów)...');
          setTimeout(() => {
            try {
              const files = fs.readdirSync(modsDir);
              for (const file of files) {
                if (file.endsWith('.jar') && !file.includes('GG_AI_Mod')) {
                  try { fs.unlinkSync(path.join(modsDir, file)); } catch(err) {}
                }
              }
            } catch(e) {}
          }, 3000);
        }
      }
      if (mainWindow) mainWindow.webContents.send('launch-finished', { code: e }); 
    });

    launcher.launch(opts).catch(err => {
      if (mainWindow) mainWindow.webContents.send('launch-error', err.message);
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});


// ═══════════════════════════════════════ AUTO-UPDATE SYSTEM ═══════════════════════════════════════

// Helper to check for updates on GitHub Releases
async function checkForUpdates() {
  try {
    const pkg = require('./package.json');
    const owner = (devConfig && devConfig.github && devConfig.github.owner) || (pkg.updateConfig && pkg.updateConfig.owner) || 'ItzzSigma03';
    const repo = (devConfig && devConfig.github && devConfig.github.repo) || (pkg.updateConfig && pkg.updateConfig.repo) || 'gg-launcher';
    
    const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const headers = { 'User-Agent': 'GG-Launcher-Updater' };
    
    // Use dev token if available to prevent API rate limits
    if (devConfig && devConfig.github && devConfig.github.token) {
      headers['Authorization'] = `token ${devConfig.github.token}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      return null;
    }

    const release = await res.json();
    if (!release || !release.tag_name) return null;

    const latestVersion = release.tag_name.replace(/^v/, '');
    const currentVersion = pkg.version;

    // Compare versions
    if (isNewerVersion(latestVersion, currentVersion)) {
      const asset = release.assets.find(a => a.name.endsWith('.exe'));
      if (asset) {
        return {
          version: latestVersion,
          downloadUrl: asset.browser_download_url
        };
      }
    }
  } catch (err) {
    console.error('Błąd sprawdzania aktualizacji:', err);
  }
  return null;
}

// Compare versions like "1.0.1" > "1.0.0"
function isNewerVersion(latest, current) {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lVal = l[i] || 0;
    const cVal = c[i] || 0;
    if (lVal > cVal) return true;
    if (lVal < cVal) return false;
  }
  return false;
}

// Stream download helper with progress percentage
function downloadUpdateFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'GG-Launcher-Updater' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        downloadUpdateFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Serwer zwrócił status ${res.statusCode}`));
        return;
      }

      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      let downloadedBytes = 0;
      const fileStream = fs.createWriteStream(dest);

      res.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        fileStream.write(chunk);
        if (totalBytes > 0) {
          const percent = Math.round((downloadedBytes / totalBytes) * 100);
          onProgress(percent);
        }
      });

      res.on('end', () => {
        fileStream.end();
        resolve();
      });

      res.on('error', (err) => {
        fileStream.close();
        fs.unlink(dest, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

// IPC check if current launcher installation runs in developer mode
ipcMain.handle('is-developer', () => {
  return !!(devConfig && devConfig.isDeveloper);
});

// IPC developer action to compile, upload and release update
ipcMain.handle('release-update', async (event) => {
  try {
    const pkgPath = path.join(__dirname, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    
    const owner = (devConfig && devConfig.github && devConfig.github.owner) || (pkg.updateConfig && pkg.updateConfig.owner);
    const repo = (devConfig && devConfig.github && devConfig.github.repo) || (pkg.updateConfig && pkg.updateConfig.repo);
    const token = devConfig && devConfig.github && devConfig.github.token;

    if (!owner || !repo || !token || owner.includes('TWÓJ_') || token.includes('TWÓJ_')) {
      throw new Error('Skonfiguruj poprawnie dane GitHub (owner, repo, token) w pliku update_config.json!');
    }

    // 1. Podbicie wersji w package.json
    const oldVersion = pkg.version;
    const parts = oldVersion.split('.');
    parts[2] = parseInt(parts[2], 10) + 1; // Increment patch
    const newVersion = parts.join('.');
    pkg.version = newVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');

    if (mainWindow) {
      mainWindow.webContents.send('release-status', `[1/4] Podbito wersję z v${oldVersion} do v${newVersion}...`);
    }

    // 2. Kompilacja za pomocą electron-builder
    if (mainWindow) {
      mainWindow.webContents.send('release-status', `[2/4] Kompilowanie nowego instalatora (to zajmie około minuty)...`);
    }

    await new Promise((resolve, reject) => {
      exec('npm run dist', { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Kompilacja nie powiodła się: ${error.message}`));
        } else {
          resolve();
        }
      });
    });

    const distDir = path.join(__dirname, 'dist');
    const installerFile = `gg-launcher Setup ${newVersion}.exe`;
    const installerPath = path.join(distDir, installerFile);

    if (!fs.existsSync(installerPath)) {
      throw new Error(`Nie odnaleziono gotowego instalatora pod ścieżką: ${installerPath}`);
    }

    if (mainWindow) {
      mainWindow.webContents.send('release-status', `[3/4] Tworzenie wydania v${newVersion} na GitHubie...`);
    }

    // 3. Tworzenie wydania (Release) na GitHubie
    const releaseRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'GG-Launcher-Developer'
      },
      body: JSON.stringify({
        tag_name: `v${newVersion}`,
        name: `GG Launcher v${newVersion}`,
        body: `Automatyczna przymusowa aktualizacja GG Launcher wydana przez dewelopera.`,
        draft: false,
        prerelease: false
      })
    });

    if (!releaseRes.ok) {
      const errorText = await releaseRes.text();
      throw new Error(`Błąd GitHub API (Release creation): ${errorText}`);
    }

    const releaseData = await releaseRes.json();
    const releaseId = releaseData.id;

    if (mainWindow) {
      mainWindow.webContents.send('release-status', `[4/4] Przesyłanie pliku instalatora na serwery GitHub...`);
    }

    // 4. Przesłanie skompilowanego pliku .exe do utworzonego wydania
    const fileBuffer = fs.readFileSync(installerPath);
    const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(installerFile)}`;

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuffer.length,
        'User-Agent': 'GG-Launcher-Developer'
      },
      body: fileBuffer
    });

    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      throw new Error(`Błąd GitHub API (Asset Upload): ${errorText}`);
    }

    if (mainWindow) {
      mainWindow.webContents.send('release-status', `✓ Sukces! Aktualizacja v${newVersion} została opublikowana.`);
    }

    return { success: true, version: newVersion };
  } catch (err) {
    if (mainWindow) {
      mainWindow.webContents.send('release-status', `❌ Błąd: ${err.message}`);
    }
    return { success: false, error: err.message };
  }
});
