// GG Launcher - Frontend Renderer JavaScript

document.addEventListener('DOMContentLoaded', () => {
  // Navigation elements
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  // Account elements
  const btnChangeAccount = document.getElementById('btn-change-account');
  const accountsModal = document.getElementById('accounts-modal');
  const btnCloseAccounts = document.getElementById('btn-close-accounts');
  const modalAccountsList = document.getElementById('modal-accounts-list');
  const newAccountName = document.getElementById('new-account-name');
  const chkUsePremiumSkin = document.getElementById('chk-use-premium-skin');
  const btnAddAccountSubmit = document.getElementById('btn-add-account-submit');
  const activeAccountAvatar = document.getElementById('active-account-avatar');
  const activeAccountName   = document.getElementById('active-account-name');
  const activeAccountType   = document.getElementById('active-account-type');
  const skinFileInput = document.getElementById('skin-file-input');
  const btnSelectSkinFile = document.getElementById('btn-select-skin-file');
  const skinFileName = document.getElementById('skin-file-name');

  // Launch elements
  const versionSelect = document.getElementById('version-select');
  const btnLaunch = document.getElementById('btn-launch');
  const progressContainer = document.getElementById('progress-container');
  const progressStatus = document.getElementById('progress-status');
  const progressPercent = document.getElementById('progress-percent');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const launcherStatusText = document.getElementById('launcher-status-text');

  // Version category filter checkboxes
  const filterReleases = document.getElementById('filter-releases');
  const filterSnapshots = document.getElementById('filter-snapshots');
  const filterBetas = document.getElementById('filter-betas');
  const filterAlphas = document.getElementById('filter-alphas');

  // Settings elements
  const ramSlider = document.getElementById('ram-slider');
  const ramValue = document.getElementById('ram-value');
  const gameDirInput = document.getElementById('game-dir-input');
  const btnBrowseGameDir = document.getElementById('btn-browse-game-dir');
  const javaPathInput = document.getElementById('java-path-input');
  const btnBrowseJava = document.getElementById('btn-browse-java');
  const gameWidthInput = document.getElementById('game-width');
  const gameHeightInput = document.getElementById('game-height');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnResetSettings = document.getElementById('btn-reset-settings');

  // Console elements
  const consoleOutput = document.getElementById('console-output');
  const btnClearConsole = document.getElementById('btn-clear-console');
  const btnCopyConsole = document.getElementById('btn-copy-console');

  // Other UI elements
  const btnMinimize = document.getElementById('btn-minimize');
  const btnMaximize = document.getElementById('btn-maximize');
  const btnClose = document.getElementById('btn-close');
  const btnCopyIp = document.getElementById('btn-copy-ip');

  // Global settings state
  let settings = {
    activeAccountUuid: '',
    selectedVersion: '',
    ram: '4',
    gameDir: '',
    javaPath: '',
    width: '1024',
    height: '768',
    filterReleases: true,
    filterSnapshots: false,
    filterBetas: false,
    filterAlphas: false
  };

  // Accounts List database
  let accounts = [];

  // Keep track of all versions loaded from Mojang API
  let allVersions = [];

  // State flag for game running
  let isGameLaunching = false;

  // 1. Navigation Tab Switching
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.getAttribute('data-tab');
      
      navItems.forEach(nav => nav.classList.remove('active'));
      tabContents.forEach(tab => tab.classList.remove('active'));

      item.classList.add('active');
      document.getElementById(targetTab).classList.add('active');

      // Refresh Skórki tab data whenever user navigates to it
      if (targetTab === 'tab-skins') {
        refreshSkinsTab();
      }
    });
  });

  // 2. Window Control Buttons
  if (btnMinimize) {
    btnMinimize.addEventListener('click', () => {
      window.electronAPI.minimizeWindow();
    });
  }

  if (btnMaximize) {
    btnMaximize.addEventListener('click', () => {
      window.electronAPI.maximizeWindow();
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      window.electronAPI.closeWindow();
    });
  }

  // 3. Load & Save Settings
  function loadSettings() {
    const savedSettings = localStorage.getItem('gg_launcher_settings');
    if (savedSettings) {
      try {
        settings = { ...settings, ...JSON.parse(savedSettings) };
      } catch (e) {
        console.error('Error parsing settings:', e);
      }
    }

    // Load accounts list
    const savedAccounts = localStorage.getItem('gg_launcher_accounts');
    if (savedAccounts) {
      try {
        accounts = JSON.parse(savedAccounts);
      } catch (e) {
        console.error('Error parsing accounts:', e);
      }
    }

    // If no accounts exist, create a default one
    if (accounts.length === 0) {
      const defaultAccount = {
        username: 'GG_Player',
        uuid: generateOfflineUuid('GG_Player'),
        type: 'Offline'
      };
      accounts.push(defaultAccount);
      settings.activeAccountUuid = defaultAccount.uuid;
      localStorage.setItem('gg_launcher_accounts', JSON.stringify(accounts));
    }

    // If active account is not set or not in list, pick the first one
    let activeAccount = accounts.find(acc => acc.uuid === settings.activeAccountUuid);
    if (!activeAccount) {
      activeAccount = accounts[0];
      settings.activeAccountUuid = activeAccount.uuid;
    }
    
    // Apply settings to inputs
    ramSlider.value = settings.ram;
    ramValue.textContent = settings.ram;
    gameDirInput.value = settings.gameDir;
    javaPathInput.value = settings.javaPath;
    gameWidthInput.value = settings.width;
    gameHeightInput.value = settings.height;

    // Apply settings to checkboxes
    filterReleases.checked = settings.filterReleases !== undefined ? settings.filterReleases : true;
    filterSnapshots.checked = settings.filterSnapshots !== undefined ? settings.filterSnapshots : false;
    filterBetas.checked = settings.filterBetas !== undefined ? settings.filterBetas : false;
    filterAlphas.checked = settings.filterAlphas !== undefined ? settings.filterAlphas : false;

    // Render active account details
    renderActiveAccount(activeAccount);
  }

  function saveSettings() {
    settings.ram = ramSlider.value;
    settings.gameDir = gameDirInput.value.trim();
    settings.javaPath = javaPathInput.value.trim();
    settings.width = gameWidthInput.value || '1024';
    settings.height = gameHeightInput.value || '768';
    
    settings.filterReleases = filterReleases.checked;
    settings.filterSnapshots = filterSnapshots.checked;
    settings.filterBetas = filterBetas.checked;
    settings.filterAlphas = filterAlphas.checked;
    
    if (versionSelect.value && versionSelect.value !== 'loading') {
      settings.selectedVersion = versionSelect.value;
    }

    localStorage.setItem('gg_launcher_settings', JSON.stringify(settings));
    addConsoleLog('[SYSTEM] Ustawienia zostały zapisane.');
  }

  // Helper to extract the player head from full skin image sheet
  function getHeadFromSkinBase64(skinBase64) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false; // pixel art look
        
        // Draw main head base (8,8,8,8) scaled to (0,0,40,40)
        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 40, 40);
        // Draw overlay helm (40,8,8,8) scaled to (0,0,40,40)
        ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 40, 40);
        
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null); // null = use fallback
      img.src = skinBase64;
    });
  }

  // Helper to determine Steve or Alex based on username hash (same logic as Minecraft)
  function getDefaultAvatarUrl(username, size) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Alex has slim model - use odd hash → Alex, even → Steve
    const isAlex = (Math.abs(hash) % 2) === 1;
    const skinName = isAlex ? 'MHF_Alex' : 'MHF_Steve';
    return `https://mc-heads.net/avatar/${skinName}/${size || 40}`;
  }

  // Active account render helper
  async function renderActiveAccount(account) {
    if (!account) return;
    activeAccountName.textContent = account.username;
    
    let displayType = 'Offline';
    if (account.type === 'Premium') {
      displayType = 'Skin Premium';
    } else if (account.type === 'Custom') {
      displayType = 'Własny Skin';
    }
    activeAccountType.textContent = displayType;

    // Update Skórki tab info if elements exist
    const skinsActiveName = document.getElementById('skins-active-name');
    const skinsActiveType = document.getElementById('skins-active-type');
    const skinsActiveAvatar = document.getElementById('skins-active-avatar');
    if (skinsActiveName) {
      skinsActiveName.textContent = account.username;
      skinsActiveType.textContent = displayType;
    }

    if (account.skinBase64) {
      // Skin uploaded - extract face directly from skin data
      const headUrl = await getHeadFromSkinBase64(account.skinBase64);
      if (headUrl) {
        activeAccountAvatar.src = headUrl;
        if (skinsActiveAvatar) skinsActiveAvatar.src = headUrl;
        return;
      }
    }
    
    if (account.type === 'Premium') {
      // Premium account - try to load skin from Mojang via mc-heads
      activeAccountAvatar.src = `https://mc-heads.net/avatar/${account.username}/40`;
      if (skinsActiveAvatar) skinsActiveAvatar.src = `https://mc-heads.net/avatar/${account.username}/80`;
      
      // Async download & cache skin sheet for next time
      setTimeout(async () => {
        try {
          const skinUrl = `https://mc-heads.net/skin/${account.username}`;
          const res = await window.electronAPI.fetchImageBase64(skinUrl);
          if (res && res.success && res.base64) {
            account.skinBase64 = res.base64;
            const idx = accounts.findIndex(a => a.uuid === account.uuid);
            if (idx !== -1) {
              accounts[idx].skinBase64 = res.base64;
              localStorage.setItem('gg_launcher_accounts', JSON.stringify(accounts));
            }
            const headUrl = await getHeadFromSkinBase64(account.skinBase64);
            if (headUrl) {
              activeAccountAvatar.src = headUrl;
              if (skinsActiveAvatar) skinsActiveAvatar.src = headUrl;
            }
          }
        } catch (e) {
          console.warn('Failed to fetch and cache skin:', e);
        }
      }, 100);
    } else {
      // Offline or Custom without skin - use Steve or Alex based on username
      const defUrl40 = getDefaultAvatarUrl(account.username, 40);
      activeAccountAvatar.src = defUrl40;
      if (skinsActiveAvatar) {
        skinsActiveAvatar.src = getDefaultAvatarUrl(account.username, 80);
      }
    }
  }

  // Setup generic avatar fallback - Steve/Alex based on active account username
  activeAccountAvatar.onerror = function() {
    this.onerror = null; // prevent infinite loop
    const activeAcc = accounts ? accounts.find(a => a.uuid === settings.activeAccountUuid) : null;
    this.src = activeAcc ? getDefaultAvatarUrl(activeAcc.username, 40) : 'https://mc-heads.net/avatar/MHF_Steve/40';
  };

  // Helper to generate a random offline UUID format
  function generateOfflineUuid(username) {
    // Generate deterministic-looking UUID hash for username
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    let hex = Math.abs(hash).toString(16).padEnd(32, '0').slice(0, 32);
    // Format to 8-4-4-4-12
    return hex.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  }

  btnSaveSettings.addEventListener('click', () => {
    saveSettings();
    alert('Ustawienia zostały pomyślnie zapisane!');
  });

  btnResetSettings.addEventListener('click', () => {
    if (confirm('Czy na pewno chcesz przywrócić ustawienia domyślne?')) {
      settings = {
        activeAccountUuid: settings.activeAccountUuid, // keep active account
        selectedVersion: settings.selectedVersion, // keep version
        ram: '4',
        gameDir: '',
        javaPath: '',
        width: '1024',
        height: '768',
        filterReleases: true,
        filterSnapshots: false,
        filterBetas: false,
        filterAlphas: false
      };
      localStorage.setItem('gg_launcher_settings', JSON.stringify(settings));
      loadSettings();
      renderVersions();
      addConsoleLog('[SYSTEM] Ustawienia przywrócone do domyślnych.');
    }
  });

  // RAM Slider Display Sync
  ramSlider.addEventListener('input', () => {
    ramValue.textContent = ramSlider.value;
  });

  // Browse Directory Buttons
  btnBrowseGameDir.addEventListener('click', async () => {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      gameDirInput.value = dir;
    }
  });

  btnBrowseJava.addEventListener('click', async () => {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      javaPathInput.value = dir;
    }
  });

  // Copy IP Button
  btnCopyIp.addEventListener('click', () => {
    navigator.clipboard.writeText('mc.ggnetwork.pl').then(() => {
      const originalText = btnCopyIp.textContent;
      btnCopyIp.textContent = 'Skopiowano!';
      btnCopyIp.classList.add('btn-primary');
      btnCopyIp.classList.remove('btn-secondary');
      setTimeout(() => {
        btnCopyIp.textContent = originalText;
        btnCopyIp.classList.remove('btn-primary');
        btnCopyIp.classList.add('btn-secondary');
      }, 2000);
    });
  });

  // 4. Accounts Modal Functionality
  btnChangeAccount.addEventListener('click', () => {
    renderAccountsList();
    accountsModal.classList.remove('hidden');
  });

  btnCloseAccounts.addEventListener('click', () => {
    accountsModal.classList.add('hidden');
  });

  // Close modal when clicking outside content
  accountsModal.addEventListener('click', (e) => {
    if (e.target === accountsModal) {
      accountsModal.classList.add('hidden');
    }
  });

  function renderAccountsList() {
    modalAccountsList.innerHTML = '';
    
    accounts.forEach(acc => {
      const isActive = acc.uuid === settings.activeAccountUuid;
      
      const item = document.createElement('div');
      item.className = `modal-account-item${isActive ? ' active' : ''}`;
      
      // Select account on click
      item.addEventListener('click', (e) => {
        // Prevent trigger when clicking delete button
        if (e.target.closest('.account-item-delete')) return;
        
        settings.activeAccountUuid = acc.uuid;
        localStorage.setItem('gg_launcher_settings', JSON.stringify(settings));
        
        // Render update on dashboard
        renderActiveAccount(acc);
        
        // Refresh modal list
        renderAccountsList();
        
        addConsoleLog(`[SYSTEM] Zmieniono aktywne konto na: ${acc.username}`);
        accountsModal.classList.add('hidden');
      });

      // Micro Avatar
      const avatarWrapper = document.createElement('div');
      avatarWrapper.className = 'avatar-wrapper-micro';
      const img = document.createElement('img');
      img.className = 'account-avatar';
      if (acc.skinBase64) {
        // Has skin data - extract head from it
        img.src = getDefaultAvatarUrl(acc.username, 24); // placeholder while processing
        getHeadFromSkinBase64(acc.skinBase64).then(headUrl => {
          if (headUrl) img.src = headUrl;
        });
      } else if (acc.type === 'Premium') {
        img.src = `https://mc-heads.net/avatar/${acc.username}/24`;
        img.onerror = function() { this.onerror = null; this.src = getDefaultAvatarUrl(acc.username, 24); };
      } else {
        img.src = getDefaultAvatarUrl(acc.username, 24);
      }
      avatarWrapper.appendChild(img);
      
      // Name
      const name = document.createElement('span');
      name.className = 'modal-account-name';
      name.textContent = acc.username;
      
      // Type tag (Premium/Offline/Custom)
      const typeTag = document.createElement('span');
      typeTag.style.fontSize = '9px';
      if (acc.type === 'Premium') {
        typeTag.style.color = '#ff6600';
        typeTag.textContent = ' [SKIN]';
      } else if (acc.type === 'Custom') {
        typeTag.style.color = '#00ff66';
        typeTag.textContent = ' [WŁASNY]';
      } else {
        typeTag.style.color = '#888';
        typeTag.textContent = '';
      }

      item.appendChild(avatarWrapper);
      item.appendChild(name);
      name.appendChild(typeTag);
      
      // Delete button (hide for active account if it's the last one)
      if (accounts.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.className = 'account-item-delete';
        delBtn.innerHTML = '&#128465;'; // Trash can emoji
        delBtn.title = 'Usuń konto';
        
        delBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (confirm(`Czy na pewno chcesz usunąć konto ${acc.username}?`)) {
            // Remove account
            accounts = accounts.filter(item => item.uuid !== acc.uuid);
            localStorage.setItem('gg_launcher_accounts', JSON.stringify(accounts));
            
            // If we deleted the active account, set a new active account
            if (isActive) {
              settings.activeAccountUuid = accounts[0].uuid;
              localStorage.setItem('gg_launcher_settings', JSON.stringify(settings));
              renderActiveAccount(accounts[0]);
            }
            
            renderAccountsList();
            addConsoleLog(`[SYSTEM] Usunięto konto: ${acc.username}`);
          }
        });
        
        item.appendChild(delBtn);
      }
      
      modalAccountsList.appendChild(item);
    });
  }

  // Selected skin image file in base64
  let selectedSkinBase64 = '';

  // Trigger file selection dialog
  btnSelectSkinFile.addEventListener('click', () => {
    skinFileInput.click();
  });

  // Handle skin file loading and canvas conversion (PNG/JPG/BMP -> standard 64x64 PNG)
  skinFileInput.addEventListener('change', () => {
    const file = skinFileInput.files[0];
    if (!file) return;

    skinFileName.textContent = `Wczytywanie: ${file.name}...`;
    skinFileName.style.color = 'var(--color-text-secondary)';

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Minecraft skin must be 64x64
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Clear canvas with full transparency first
        ctx.clearRect(0, 0, 64, 64);

        if (img.width === 64 && img.height === 64) {
          // Standard modern skin format – draw as-is
          ctx.drawImage(img, 0, 0, 64, 64);
        } else if (img.width === 64 && img.height === 32) {
          // Old legacy skin format (64x32) – draw to top half
          ctx.drawImage(img, 0, 0, 64, 32);
        } else {
          // Unknown size – scale to fit 64x64
          ctx.drawImage(img, 0, 0, 64, 64);
        }

        // Export as PNG to preserve alpha channel
        selectedSkinBase64 = canvas.toDataURL('image/png');

        chkUsePremiumSkin.checked = false;

        skinFileName.textContent = `Wgrano: ${file.name} (${img.width}×${img.height})`;
        skinFileName.style.color = '#00ff66';
        addConsoleLog(`[SYSTEM] Załadowano skin: ${file.name} (${img.width}×${img.height}px)`);
      };
      img.onerror = () => {
        alert('Nie udało się wczytać pliku graficznego. Upewnij się, że plik to .png ze skinem Minecraft.');
        skinFileName.textContent = 'Błąd wczytywania pliku';
        skinFileName.style.color = '#ef4444';
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });


  // Clear uploaded skin state if premium skin checkbox is checked
  chkUsePremiumSkin.addEventListener('change', () => {
    if (chkUsePremiumSkin.checked) {
      selectedSkinBase64 = '';
      skinFileInput.value = '';
      skinFileName.textContent = 'Dozwolone: .png, .jpg, .bmp';
      skinFileName.style.color = 'var(--color-text-secondary)';
    }
  });

  // Add Account Form Submit
  btnAddAccountSubmit.addEventListener('click', async () => {
    const name = newAccountName.value.trim();
    if (!name) {
      alert('Wpisz nick gracza!');
      return;
    }

    // Check if account already exists
    const exists = accounts.some(acc => acc.username.toLowerCase() === name.toLowerCase());
    if (exists) {
      alert('Konto o takim nicku już istnieje!');
      return;
    }

    btnAddAccountSubmit.disabled = true;
    btnAddAccountSubmit.textContent = 'SPRAWDZANIE...';

    let uuid = '';
    let accountType = 'Offline';
    let skinData = '';

    if (selectedSkinBase64) {
      // User uploaded a custom skin file
      uuid = generateOfflineUuid(name);
      accountType = 'Custom';
      skinData = selectedSkinBase64;
      addConsoleLog(`[SYSTEM] Załączono własny skin z pliku dla konta: ${name}`);
    } else if (chkUsePremiumSkin.checked) {
      addConsoleLog(`[SYSTEM] Szukanie konta premium dla: ${name}...`);
      const profile = await window.electronAPI.getPremiumUuid(name);
      if (profile.exists) {
        uuid = profile.uuid;
        accountType = 'Premium';
        addConsoleLog(`[SYSTEM] Znaleziono skin premium dla konta. Powiązano UUID: ${uuid}`);
        
        // Fetch skin base64 immediately
        try {
          const skinUrl = `https://mc-heads.net/skin/${name}`;
          const skinRes = await window.electronAPI.fetchImageBase64(skinUrl);
          if (skinRes.success && skinRes.base64) {
            skinData = skinRes.base64;
          }
        } catch (e) {
          console.warn('Failed to fetch premium skin on creation:', e);
        }
      } else {
        uuid = generateOfflineUuid(name);
        addConsoleLog(`[SYSTEM] Profil premium nie istnieje. Konto utworzone w trybie Offline.`);
        // Try fetching skin anyway
        try {
          const skinUrl = `https://mc-heads.net/skin/${name}`;
          const skinRes = await window.electronAPI.fetchImageBase64(skinUrl);
          if (skinRes.success && skinRes.base64) {
            skinData = skinRes.base64;
          }
        } catch (e) {
          console.warn('Failed to fetch skin on creation:', e);
        }
      }
    } else {
      uuid = generateOfflineUuid(name);
      // Fetch skin base64 immediately for Offline account
      try {
        const skinUrl = `https://mc-heads.net/skin/${name}`;
        const skinRes = await window.electronAPI.fetchImageBase64(skinUrl);
        if (skinRes.success && skinRes.base64) {
          skinData = skinRes.base64;
        }
      } catch (e) {
        console.warn('Failed to fetch offline skin on creation:', e);
      }
    }

    // Add account to list
    const newAcc = {
      username: name,
      uuid: uuid,
      type: accountType,
      skinBase64: skinData
    };

    accounts.push(newAcc);
    localStorage.setItem('gg_launcher_accounts', JSON.stringify(accounts));

    // Set as active account
    settings.activeAccountUuid = newAcc.uuid;
    localStorage.setItem('gg_launcher_settings', JSON.stringify(settings));

    // Clear inputs & states
    newAccountName.value = '';
    selectedSkinBase64 = '';
    skinFileInput.value = '';
    skinFileName.textContent = 'Dozwolone: .png, .jpg, .bmp';
    skinFileName.style.color = 'var(--color-text-secondary)';
    
    // Close modal & update dashboard
    accountsModal.classList.add('hidden');
    renderActiveAccount(newAcc);
    
    btnAddAccountSubmit.disabled = false;
    btnAddAccountSubmit.textContent = 'DODAJ KONTO';
    
    alert(`Pomyślnie dodano konto ${name}!`);
  });

  // 5. Render Game Versions based on active filters
  function renderVersions() {
    const previousSelection = versionSelect.value || settings.selectedVersion;
    versionSelect.innerHTML = '';

    // Add modpacks to the top of version select
    if (modpacks && modpacks.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = 'Moje Modpacki (GG Mods)';
      
      modpacks.forEach(mp => {
        const option = document.createElement('option');
        option.value = `modpack:${mp.id}`;
        option.textContent = `🎮 Modpack: ${mp.name} (${mp.loader || 'Fabric'} ${mp.version || '1.20.1'})`;
        if (previousSelection === `modpack:${mp.id}`) {
          option.selected = true;
        }
        optGroup.appendChild(option);
      });
      versionSelect.appendChild(optGroup);
    }

    const showReleases = filterReleases.checked;
    const showSnapshots = filterSnapshots.checked;
    const showBetas = filterBetas.checked;
    const showAlphas = filterAlphas.checked;

    // Filter versions
    const filtered = allVersions.filter(v => {
      if (v.type === 'release' && showReleases) return true;
      if (v.type === 'snapshot' && showSnapshots) return true;
      if (v.type === 'old_beta' && showBetas) return true;
      if (v.type === 'old_alpha' && showAlphas) return true;
      return false;
    });

    if (filtered.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Brak pasujących wersji (zaznacz filtry)';
      option.disabled = true;
      option.selected = true;
      versionSelect.appendChild(option);
      return;
    }

    filtered.forEach((v, index) => {
      const option = document.createElement('option');
      option.value = v.id;

      let prefix = 'Minecraft';
      if (v.type === 'snapshot') prefix = 'Snapshot';
      else if (v.type === 'old_beta') prefix = 'Beta';
      else if (v.type === 'old_alpha') prefix = 'Alpha';

      option.textContent = `${prefix} ${v.id}`;

      // Select previous selection if it is still available in the filtered list
      if (previousSelection && v.id === previousSelection) {
        option.selected = true;
      } else if (!previousSelection && index === 0) {
        option.selected = true;
      }

      versionSelect.appendChild(option);
    });
  }

  // Bind change listeners to version filters
  [filterReleases, filterSnapshots, filterBetas, filterAlphas].forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      renderVersions();
      saveSettings();
    });
  });

  // Fetch Minecraft Versions from Mojang API
  async function fetchVersions() {
    try {
      addConsoleLog('[SYSTEM] Pobieranie listy wersji Minecraft...');
      const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
      const data = await response.json();
      
      allVersions = data.versions;
      
      // Populate modpack version select dropdown (releases only)
      newModpackVersionSelect.innerHTML = '<option value="" disabled selected>Wersja Minecraft...</option>';
      const releases = allVersions.filter(v => v.type === 'release');
      releases.forEach(r => {
        const option = document.createElement('option');
        option.value = r.id;
        option.textContent = r.id;
        newModpackVersionSelect.appendChild(option);
      });
      
      renderVersions();
      
      addConsoleLog(`[SYSTEM] Pomyślnie załadowano listę wersji (${allVersions.length} łącznie).`);
    } catch (error) {
      addConsoleLog(`[BŁĄD] Nie udało się załadować wersji Minecraft: ${error.message}`, true);
      versionSelect.innerHTML = '<option value="1.20.1">Minecraft 1.20.1 (Offline fallback)</option><option value="1.20.4">Minecraft 1.20.4 (Offline fallback)</option>';
      newModpackVersionSelect.innerHTML = '<option value="" disabled selected>Wersja Minecraft...</option><option value="1.20.1">1.20.1</option><option value="1.20.4">1.20.4</option>';
    }
  }

  // 6. Console logging helper
  function addConsoleLog(text, isError = false) {
    const line = document.createElement('div');
    line.className = `console-line${isError ? ' error' : ''}`;
    
    // Quick sanitization & format
    line.textContent = text;
    
    consoleOutput.appendChild(line);
    
    // Auto-scroll to bottom
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
    
    // Prevent memory leaks / UI lag
    if (consoleOutput.children.length > 1000) {
      consoleOutput.removeChild(consoleOutput.firstChild);
    }
  }

  btnClearConsole.addEventListener('click', () => {
    consoleOutput.innerHTML = '';
    addConsoleLog('[SYSTEM] Konsola została wyczyszczona.');
  });

  btnCopyConsole.addEventListener('click', () => {
    const text = Array.from(consoleOutput.children)
      .map(line => line.textContent)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert('Logi skopiowane do schowka!');
    });
  });

  // 7. Launch Orchestration
  btnLaunch.addEventListener('click', async () => {
    if (isGameLaunching) return;

    // Get active account
    const activeAccount = accounts.find(acc => acc.uuid === settings.activeAccountUuid);
    if (!activeAccount || !activeAccount.username) {
      alert('Błąd: brak aktywnego konta gracza! Wybierz lub dodaj konto w zarządcy kont.');
      return;
    }

    if (!versionSelect.value) {
      alert('Proszę wybrać wersję gry!');
      return;
    }

    saveSettings();
    isGameLaunching = true;
    
    // Update UI elements for launch start
    btnLaunch.disabled = true;
    btnLaunch.classList.add('running');
    btnLaunch.querySelector('.btn-text').textContent = 'URUCHAMIANIE...';
    
    progressContainer.classList.remove('hidden');
    progressBarFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.textContent = 'Inicjalizacja launchera...';
    
    launcherStatusText.textContent = 'Pobieranie plików...';
    
    const indicatorDot = document.querySelector('.indicator-dot');
    indicatorDot.className = 'indicator-dot busy';

    let targetVersion = versionSelect.value;
    let loaderType = 'Vanilla';
    let activeModpack = null;

    if (targetVersion.startsWith('modpack:')) {
      const modpackId = targetVersion.substring(8);
      activeModpack = modpacks.find(mp => mp.id === modpackId);
      if (!activeModpack) {
        handleLaunchFailure('Nie znaleziono wybranego modpacka!');
        return;
      }
      targetVersion = activeModpack.version || '1.20.1';
      loaderType = activeModpack.loader || 'Fabric';
    }

    // Validate game directory – if not set, use default .minecraft path (backend fallback)
    // Show a warning but don't block (backend will use AppData/.minecraft as fallback)
    if (!settings.gameDir || settings.gameDir.trim() === '') {
      addConsoleLog('[OSTRZEŻENIE] Folder gry nie jest ustawiony – używam domyślnego AppData\\.minecraft');
    }

    // Normalize loader name to exact expected values
    const loaderMap = {
      'fabric': 'Fabric',
      'forge': 'Forge',
      'neoforge': 'NeoForge',
      'vanilla': 'Vanilla'
    };
    const loaderNormalized = loaderMap[loaderType.toLowerCase()];
    if (loaderNormalized) {
      loaderType = loaderNormalized;
    }

    addConsoleLog(`[SYSTEM] Rozpoczynanie uruchamiania wersji ${targetVersion} (${loaderType}) dla konta ${activeAccount.username} (UUID: ${activeAccount.uuid})...`);
    
    // Deploy custom skin as resource pack if this is a custom account
    if (activeAccount.type === 'Custom' && activeAccount.skinBase64) {
      progressStatus.textContent = 'Generowanie skina...';
      addConsoleLog('[SYSTEM] Wdrażanie własnego skina jako Resource Pack (GG_Launcher_Skins)...');
      const rpRes = await window.electronAPI.saveCustomSkin({
        gameDirectory: settings.gameDir,
        skinBase64: activeAccount.skinBase64,
        gameVersion: targetVersion
      });
      if (rpRes.success) {
        addConsoleLog('[SYSTEM] Paczka zasobów ze skinem została pomyślnie zaktualizowana.');
      } else {
        addConsoleLog(`[OSTRZEŻENIE] Nie udało się wdrożyć skina: ${rpRes.error || 'Nieznany błąd'}`);
      }
    }

    // Download and deploy mods from the active modpack if selected
    if (activeModpack && activeModpack.mods) {
      progressStatus.textContent = 'Przygotowywanie modów...';
      addConsoleLog(`[SYSTEM] Modpack: ${activeModpack.name}. Przygotowywanie modyfikacji...`);
      
      const dlRes = await window.electronAPI.downloadMods({
        gameDirectory: settings.gameDir,
        mods: activeModpack.mods,
        loaderType: loaderType,
        gameVersion: targetVersion
      });
      if (dlRes.success) {
        addConsoleLog('[SYSTEM] Pomyślnie przygotowano modyfikacje z modpacka.');
      } else {
        handleLaunchFailure(dlRes.error || 'Nieznany błąd podczas pobierania modów.');
        return;
      }
    }

    // Install loader (Fabric, Forge, NeoForge) if modded
    let launchVersion = targetVersion;
    if (loaderType !== 'Vanilla') {
      progressStatus.textContent = `Instalowanie silnika ${loaderType}...`;
      addConsoleLog(`[SYSTEM] Weryfikacja instalacji silnika ${loaderType} dla wersji ${targetVersion}...`);
      const loaderRes = await window.electronAPI.installLoader({
        gameDirectory: settings.gameDir,
        loaderType: loaderType,
        gameVersion: targetVersion,
        javaPath: settings.javaPath
      });
      
      if (loaderRes.success && loaderRes.versionId) {
        launchVersion = loaderRes.versionId;
        addConsoleLog(`[SYSTEM] Silnik zweryfikowany. ID wersji uruchomieniowej: ${launchVersion}`);
      } else {
        handleLaunchFailure(loaderRes.error || `Nie udało się zainstalować silnika ${loaderType}.`);
        return;
      }
    }

    const launchOptions = {
      username: activeAccount.username,
      uuid: activeAccount.uuid,
      version: launchVersion,
      maxMemory: `${settings.ram}G`,
      minMemory: '1G',
      gameDirectory: settings.gameDir,
      javaPath: settings.javaPath,
      width: settings.width,
      height: settings.height,
      isModpack: !!activeModpack
    };

    const res = await window.electronAPI.launchGame(launchOptions);
    if (!res.success) {
      handleLaunchFailure(res.error || 'Nieznany błąd podczas uruchamiania.');
    }
  });

  function handleLaunchFailure(errorMsg) {
    isGameLaunching = false;
    btnLaunch.disabled = false;
    btnLaunch.classList.remove('running');
    btnLaunch.querySelector('.btn-text').textContent = 'URUCHOM GRĘ';
    progressContainer.classList.add('hidden');
    launcherStatusText.textContent = 'Błąd uruchamiania';
    
    const indicatorDot = document.querySelector('.indicator-dot');
    indicatorDot.className = 'indicator-dot online';

    addConsoleLog(`[BŁĄD] Błąd podczas uruchamiania gry: ${errorMsg}`, true);
    alert(`Nie udało się uruchomić gry:\n${errorMsg}`);
  }

  // 8. IPC Listeners
  window.electronAPI.onLaunchStatus((status) => {
    progressStatus.textContent = status;
    addConsoleLog(`[STATUS] ${status}`);
  });

  window.electronAPI.onLaunchProgress((data) => {
    let percent = 0;
    if (data.total && data.task) {
      percent = Math.round((data.task / data.total) * 100);
    } else if (data.percent) {
      percent = Math.round(data.percent);
    } else {
      return; // Skip if no numeric data
    }
    
    progressBarFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    
    if (data.type) {
      progressStatus.textContent = `Pobieranie: ${data.type} (${data.task}/${data.total})`;
    }
  });

  window.electronAPI.onLaunchLogs((log) => {
    addConsoleLog(log);
  });

  window.electronAPI.onLaunchError((err) => {
    handleLaunchFailure(err);
  });

  window.electronAPI.onLaunchFinished((result) => {
    isGameLaunching = false;
    btnLaunch.disabled = false;
    btnLaunch.classList.remove('running');
    btnLaunch.querySelector('.btn-text').textContent = 'URUCHOM GRĘ';
    progressContainer.classList.add('hidden');
    launcherStatusText.textContent = 'Gotowy do gry';
    
    const indicatorDot = document.querySelector('.indicator-dot');
    indicatorDot.className = 'indicator-dot online';

    addConsoleLog('[SYSTEM] Gra została zamknięta (kod wyjścia: ' + result.code + ').');
  });

  // --- GG MODS SECTION ---

  const newModpackNameInput = document.getElementById('new-modpack-name');
  const newModpackVersionSelect = document.getElementById('new-modpack-version');
  const newModpackLoaderSelect = document.getElementById('new-modpack-loader');
  const btnCreateModpack = document.getElementById('btn-create-modpack');
  const modpacksListElement = document.getElementById('modpacks-list');
  const activeModpackTitle = document.getElementById('active-modpack-title');
  const activeModpackModsListElement = document.getElementById('active-modpack-mods-list');
  const modSearchInput = document.getElementById('mod-search-input');
  const modsBrowserListElement = document.getElementById('mods-browser-list');

  let modpacks = [];
  let selectedModpackId = '';

  function loadModpacks() {
    const saved = localStorage.getItem('gg_launcher_modpacks');
    if (saved) {
      try {
        modpacks = JSON.parse(saved);
        // Ensure all loaded modpacks have loader and version properties
        modpacks.forEach(mp => {
          if (!mp.loader) mp.loader = 'Fabric';
          if (!mp.version) mp.version = '1.20.1';
        });
      } catch (e) {
        console.error('Error loading modpacks:', e);
      }
    }
    
    // Create a default modpack if none exist
    if (modpacks.length === 0) {
      const defaultMp = {
        id: 'default-modpack',
        name: 'Mój Modpack',
        loader: 'Fabric',
        version: '1.20.1',
        mods: []
      };
      modpacks.push(defaultMp);
      localStorage.setItem('gg_launcher_modpacks', JSON.stringify(modpacks));
    }
    
    // Select the first modpack by default
    selectedModpackId = modpacks[0].id;
  }

  function saveModpacks() {
    localStorage.setItem('gg_launcher_modpacks', JSON.stringify(modpacks));
  }

  function renderModpacksList() {
    modpacksListElement.innerHTML = '';
    
    modpacks.forEach(mp => {
      const isActive = mp.id === selectedModpackId;
      
      const item = document.createElement('div');
      item.className = `modpack-item${isActive ? ' active' : ''}`;
      
      const details = document.createElement('div');
      details.className = 'modpack-details';
      
      const name = document.createElement('span');
      name.className = 'modpack-name';
      name.textContent = mp.name;
      
      const count = document.createElement('span');
      count.className = 'modpack-count';
      count.textContent = `${mp.loader || 'Fabric'} ${mp.version || '1.20.1'} | Mody: ${mp.mods.length}`;
      
      details.appendChild(name);
      details.appendChild(count);
      item.appendChild(details);
      
      // Delete button
      if (modpacks.length > 1) {
        const delBtn = document.createElement('button');
        delBtn.className = 'account-item-delete';
        delBtn.innerHTML = '&#128465;';
        delBtn.style.marginLeft = '10px';
        delBtn.title = 'Usuń modpack';
        
        // Delete button handler – ensures a default modpack remains
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Czy na pewno chcesz usunąć modpack ${mp.name}?`)) {
            // Remove the selected modpack
            modpacks = modpacks.filter(item => item.id !== mp.id);
            // If no modpacks remain, create a default one
            if (modpacks.length === 0) {
              const defaultMp = {
                id: 'default-modpack',
                name: 'Mój Modpack',
                loader: 'Fabric',
                version: '1.20.1',
                mods: []
              };
              modpacks.push(defaultMp);
            }
            saveModpacks();
            // Update selectedModpackId to first available modpack
            selectedModpackId = modpacks[0].id;
            renderModpacksList();
            renderActiveModpackDetails();
            renderModBrowser();
          }
        });
        
        item.appendChild(delBtn);
      }
      
      item.addEventListener('click', (e) => {
        if (e.target.closest('.account-item-delete')) return;
        selectedModpackId = mp.id;
        renderModpacksList();
        renderActiveModpackDetails();
        renderModBrowser();
      });
      
      modpacksListElement.appendChild(item);
    });
  }
 
  let currentSearchQueryId = 0;

  function renderActiveModpackDetails() {
    activeModpackModsListElement.innerHTML = '';
    const mp = modpacks.find(item => item.id === selectedModpackId);
    if (!mp) {
      activeModpackTitle.textContent = 'Wybierz modpack';
      activeModpackModsListElement.innerHTML = '<div class="empty-modpack-message">Wybierz modpack z listy powyżej.</div>';
      return;
    }
    
    activeModpackTitle.textContent = `${mp.name} (${mp.loader || 'Fabric'} ${mp.version || '1.20.1'})`;
    
    if (!mp.mods || mp.mods.length === 0) {
      activeModpackModsListElement.innerHTML = '<div class="empty-modpack-message">Brak modów w tym modpacku. Dodaj mody z przeglądarki obok!</div>';
      return;
    }
    
    mp.mods.forEach(mod => {
      const item = document.createElement('div');
      item.className = 'modpack-mod-item';
      
      const name = document.createElement('span');
      name.className = 'modpack-mod-name';
      
      if (mod.icon && mod.icon.startsWith('http')) {
        name.innerHTML = `<img src="${mod.icon}" style="width: 14px; height: 14px; border-radius: 3px; vertical-align: middle; margin-right: 6px; object-fit: cover;"> ${mod.name}`;
      } else {
        name.textContent = `📦 ${mod.name}`;
      }
      
      const delBtn = document.createElement('button');
      delBtn.className = 'account-item-delete';
      delBtn.innerHTML = '&#10005;';
      delBtn.title = 'Usuń z modpacka';
      
      delBtn.addEventListener('click', () => {
        mp.mods = mp.mods.filter(m => m.id !== mod.id);
        saveModpacks();
        renderModpacksList();
        renderActiveModpackDetails();
        renderModBrowser(modSearchInput.value);
      });
      
      item.appendChild(name);
      item.appendChild(delBtn);
      activeModpackModsListElement.appendChild(item);
    });
  }

  async function renderModBrowser(filterText = '') {
    modsBrowserListElement.innerHTML = '';
    const query = filterText.toLowerCase().trim();
    
    const activeMp = modpacks.find(item => item.id === selectedModpackId);
    if (!activeMp) {
      modsBrowserListElement.innerHTML = '<div class="empty-modpack-message" style="margin-top: 50px;">Wybierz lub utwórz modpack, aby przeglądać mody.</div>';
      return;
    }
    
    if (activeMp.loader === 'Vanilla') {
      modsBrowserListElement.innerHTML = '<div class="empty-modpack-message" style="margin-top: 50px;">Silnik Vanilla nie wspiera modów. Zmień silnik modpacka na Fabric, Forge lub NeoForge!</div>';
      return;
    }

    const searchId = ++currentSearchQueryId;
    modsBrowserListElement.innerHTML = '<div class="empty-modpack-message" style="margin-top: 50px;">Wyszukiwanie modów w bazie Modrinth...</div>';

    try {
      const loader = activeMp.loader.toLowerCase();
      const version = activeMp.version;
      
      const facets = JSON.stringify([
        [`versions:${version}`],
        [`categories:${loader}`],
        ['project_type:mod']
      ]);

      const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}&limit=20`;
      
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'com.gglauncher.app/1.0.0 (contact@ggnetwork.pl)'
        }
      });
      if (!res.ok) throw new Error(`Błąd wyszukiwania: ${res.statusText}`);
      
      const data = await res.json();
      if (searchId !== currentSearchQueryId) return;

      modsBrowserListElement.innerHTML = '';
      
      if (!data.hits || data.hits.length === 0) {
        modsBrowserListElement.innerHTML = '<div class="empty-modpack-message" style="margin-top: 50px;">Nie znaleziono pasujących modów dla wersji ' + version + ' (' + activeMp.loader + ').</div>';
        return;
      }

      data.hits.forEach(hit => {
        const isAdded = activeMp.mods ? activeMp.mods.some(m => m.id === hit.project_id) : false;
        
        const card = document.createElement('div');
        card.className = 'mod-card';
        
        const icon = document.createElement('div');
        icon.className = 'mod-icon-wrapper';
        if (hit.icon_url) {
          const img = document.createElement('img');
          img.src = hit.icon_url;
          img.className = 'mod-icon-img';
          icon.appendChild(img);
        } else {
          icon.textContent = '📦';
        }
        
        const details = document.createElement('div');
        details.className = 'mod-details';
        
        const nameRow = document.createElement('div');
        nameRow.className = 'mod-name-row';
        
        const name = document.createElement('span');
        name.className = 'mod-browser-name';
        name.textContent = hit.title;
        
        const versionTag = document.createElement('span');
        versionTag.className = 'mod-version-badge';
        versionTag.textContent = `MC ${version}`;
        
        nameRow.appendChild(name);
        nameRow.appendChild(versionTag);
        
        const desc = document.createElement('span');
        desc.className = 'mod-description';
        desc.textContent = hit.description || 'Brak opisu modyfikacji.';
        
        const metaRow = document.createElement('div');
        metaRow.className = 'mod-meta-row';
        
        const metaDownloads = document.createElement('span');
        metaDownloads.innerHTML = `Pobrań: <strong>${hit.downloads.toLocaleString()}</strong>`;
        
        metaRow.appendChild(metaDownloads);
        
        details.appendChild(nameRow);
        details.appendChild(desc);
        details.appendChild(metaRow);
        
        card.appendChild(icon);
        card.appendChild(details);
        
        const actionBtn = document.createElement('button');
        if (isAdded) {
          actionBtn.className = 'btn btn-secondary btn-sm';
          actionBtn.textContent = 'Dodano';
          actionBtn.disabled = true;
        } else {
          actionBtn.className = 'btn btn-primary btn-sm';
          actionBtn.textContent = 'Dodaj do modpacka';
          actionBtn.type = 'button';
          
          actionBtn.addEventListener('click', async () => {
            actionBtn.disabled = true;
            actionBtn.textContent = 'Szukanie pliku...';
            
            try {
              addConsoleLog(`[MODPACK] Wyszukiwanie pliku JAR dla ${hit.title} (${version}, ${activeMp.loader})...`);
              const vUrl = `https://api.modrinth.com/v2/project/${hit.project_id}/version?loaders=["${loader}"]&game_versions=["${version}"]`;
              const vRes = await fetch(vUrl, {
                headers: {
                  'User-Agent': 'com.gglauncher.app/1.0.0 (contact@ggnetwork.pl)'
                }
              });
              if (!vRes.ok) throw new Error(`Błąd pobierania wersji: ${vRes.statusText}`);
              const versionsData = await vRes.json();
              
              if (!versionsData || versionsData.length === 0) {
                throw new Error('Brak kompatybilnych wersji pliku dla wybranego silnika/wersji gry.');
              }
              
              // Pick the first version (newest)
              const newestVersion = versionsData[0];
              const file = newestVersion.files.find(f => f.primary) || newestVersion.files[0];
              
              if (!file || !file.url) {
                throw new Error('Nie znaleziono linku do pobrania pliku JAR.');
              }
              
              if (!activeMp.mods) activeMp.mods = [];
              activeMp.mods.push({
                id: hit.project_id,
                name: hit.title,
                icon: hit.icon_url,
                url: file.url,
                filename: file.filename
              });
              
              saveModpacks();
              renderModpacksList();
              renderActiveModpackDetails();
              
              actionBtn.className = 'btn btn-secondary btn-sm';
              actionBtn.textContent = 'Dodano';
              actionBtn.disabled = true;
              
              addConsoleLog(`[MODPACK] Dodano ${hit.title} do modpacka: ${file.filename}`);
            } catch (err) {
              actionBtn.disabled = false;
              actionBtn.textContent = 'Dodaj do modpacka';
              alert(`Nie udało się dodać moda:\n${err.message}`);
              addConsoleLog(`[BŁĄD] Nie udało się dodać moda ${hit.title}: ${err.message}`, true);
            }
          });
        }
        
        card.appendChild(actionBtn);
        modsBrowserListElement.appendChild(card);
      });
    } catch (error) {
      if (searchId !== currentSearchQueryId) return;
      modsBrowserListElement.innerHTML = `<div class="empty-modpack-message" style="margin-top: 50px; color: #ef4444;">Błąd wyszukiwania: ${error.message}</div>`;
      addConsoleLog(`[BŁĄD] Błąd wyszukiwania modów w bazie Modrinth: ${error.message}`, true);
    }
  }

  btnCreateModpack.addEventListener('click', () => {
    const name = newModpackNameInput.value.trim();
    if (!name) {
      alert('Wpisz nazwę modpacka!');
      return;
    }
    const version = newModpackVersionSelect.value;
    if (!version) {
      alert('Wybierz wersję Minecraft dla modpacka!');
      return;
    }
    const loader = newModpackLoaderSelect.value || 'Fabric';
    
    const newMp = {
      id: `mp-${Date.now()}`,
      name: name,
      loader: loader,
      version: version,
      mods: []
    };
    
    modpacks.push(newMp);
    saveModpacks();
    selectedModpackId = newMp.id;
    newModpackNameInput.value = '';
    newModpackVersionSelect.value = '';
    
    renderModpacksList();
    renderActiveModpackDetails();
    renderModBrowser();
    renderVersions();
    
    addConsoleLog(`[SYSTEM] Utworzono nowy modpack: ${name}`);
  });

  modSearchInput.addEventListener('input', (e) => {
    renderModBrowser(e.target.value);
  });

  // Load and initial render for modpacks
  loadModpacks();
  renderModpacksList();
  renderActiveModpackDetails();
  renderModBrowser();

  // ═══════════════════════════════════════════════════════
  //  GG AI – Generator Modów Minecraft (Gemini)
  // ═══════════════════════════════════════════════════════
  const aiApiKeyInput  = document.getElementById('ai-api-key');
  const btnAiSaveKey   = document.getElementById('btn-ai-save-key');
  const aiModelSelect  = document.getElementById('ai-model-select');
  const btnAiClear     = document.getElementById('btn-ai-clear');
  const aiChatWindow   = document.getElementById('ai-chat-window');
  const aiUserInput    = document.getElementById('ai-user-input');
  const btnAiSend      = document.getElementById('btn-ai-send');
  const btnModeChat    = document.getElementById('btn-mode-chat');
  const btnModeModgen  = document.getElementById('btn-mode-modgen');
  const aiModOptions   = document.getElementById('ai-mod-options');
  const aiLoaderSelect = document.getElementById('ai-loader-select');
  const aiMcverSelect  = document.getElementById('ai-mcver-select');

  let aiChatHistory = [];
  let aiMode = 'chat'; // 'chat' | 'modgen'
  let aiApiKey = localStorage.getItem('gg_ai_api_key') || '';
  if (aiApiKey) { aiApiKeyInput.value = aiApiKey; }

  // ── System prompts ──────────────────────────────────────
  const PROMPT_CHAT = `Jesteś GG AI – profesjonalnym generatorem i asystentem modów Minecraft w GG Launcherze.
Kiedy użytkownik prosi o stworzenie modu, zmianę w grze lub pytanie o modowanie:
1. ZAWSZE OD RAZU generujesz PEŁNY, w 100% gotowy kod Java w bloku kodu markdown (\`\`\`java ... \`\`\`). Zero skrótów, zero ucinania!
2. Podajesz nazwy klas i paczek po angielsku, z czytelnymi komentarzami i wyjaśnieniem po polsku pod blokiem kodu.
3. Jeśli pytanie dotyczy ogólnie Minecrafta, odpowiadasz konkretnie po polsku.`;

  function getModgenPrompt(loader, mcver) {
    return `Jesteś GG AI – oficjalnym generatorem kodów modów Minecraft dla ${loader} ${mcver}.
Twoje zadanie: ZA PIERWSZYM RAZEM wygenerować PEŁNY, W 100% KOMPILUJĄCY SIĘ KOD JAVA DLA MODA!

ZASADY GENEROWANIA KODU:
1. ZAWSZE podaj kod Java w bloku kodu markdown:
\`\`\`java
// Pełny kod moda w Javie dla ${loader} ${mcver}
\`\`\`
2. Kod MUSI być kompletny (zero "...", zero pomijania metod). Podaj pełną klasę moda z rejestracją przedmiotów/bloków/eventów.
3. Krótko po polsku wytłumacz działanie kodu pod blokiem. Użytkownik pobierze plik .java lub zainstaluje go bezpośrednio w launcherze.
4. Jeśli Twój mod dodaje nowe przedmioty (items) lub bloki (blocks), na samym dole swojej odpowiedzi wygeneruj metadane tekstur w specjalnych tagach, aby launcher mógł je automatycznie narysować!
Format:
[TEXTURE: item:nazwa_przedmiotu, COLOR: #hexkolor]
[TEXTURE: block:nazwa_bloku, COLOR: #hexkolor]
Przykład dla 'ruby_sword' i 'ruby_ore':
[TEXTURE: item:ruby_sword, COLOR: #e0115f]
[TEXTURE: block:ruby_ore, COLOR: #420D09]`;
  }

  // ── Mode switching ──────────────────────────────────────
  btnModeChat.addEventListener('click', () => {
    aiMode = 'chat';
    btnModeChat.classList.add('active');
    btnModeModgen.classList.remove('active');
    aiModOptions.classList.add('hidden');
    aiUserInput.placeholder = 'Zapytaj o mody Minecraft... (Enter = wyślij)';
    aiChatHistory = [];
  });

  btnModeModgen.addEventListener('click', () => {
    aiMode = 'modgen';
    btnModeModgen.classList.add('active');
    btnModeChat.classList.remove('active');
    aiModOptions.classList.remove('hidden');
    aiUserInput.placeholder = 'Opisz mod który chcesz stworzyć... np. "Dodaj miecz zadający 50 obrażeń"';
    aiChatHistory = [];
  });

  // ── Save API key ────────────────────────────────────────
  btnAiSaveKey.addEventListener('click', () => {
    const key = aiApiKeyInput.value.trim();
    if (!key) { alert('Wpisz klucz API!'); return; }
    aiApiKey = key;
    localStorage.setItem('gg_ai_api_key', key);
    btnAiSaveKey.textContent = '✓ Zapisano!';
    btnAiSaveKey.style.background = '#22c55e';
    setTimeout(() => { btnAiSaveKey.textContent = 'Zapisz'; btnAiSaveKey.style.background = ''; }, 2000);
  });

  // ── Clear chat ──────────────────────────────────────────
  btnAiClear.addEventListener('click', () => {
    aiChatHistory = [];
    aiChatWindow.innerHTML = `<div class="ai-welcome-msg">
      <span class="ai-welcome-icon">&#129302;</span>
      <div class="ai-welcome-text"><strong>Czat wyczyszczony!</strong>
      <p>Opisz mod który chcesz stworzyć lub zadaj pytanie o Minecraft.</p></div></div>`;
  });

  // ── Render code block with syntax highlight + download ──
  function renderCodeBlock(code, lang, fullMessageText) {
    lang = (lang || 'java').toLowerCase();
    const ext = lang === 'java' ? 'java' : lang === 'json' ? 'json' : 'txt';

    // Simple Java syntax highlight
    function highlight(c) {
      return c
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/(\/\/[^\n]*)/g, '<span class="cmt">$1</span>')
        .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="str">$1</span>')
        .replace(/(@\w+)/g, '<span class="ann">$1</span>')
        .replace(/\b(public|private|protected|class|interface|extends|implements|import|package|new|return|void|static|final|if|else|for|while|try|catch|throw|throws|super|this|boolean|int|double|float|long|String|override)\b/g, '<span class="kw">$1</span>')
        .replace(/\b(\d+\.?\d*[fLd]?)\b/g, '<span class="num">$1</span>');
    }

    const block = document.createElement('div');
    block.className = 'ai-code-block';

    // Guess filename from code
    const classMatch = code.match(/(?:class|interface)\s+(\w+)/);
    const fileName = classMatch ? `${classMatch[1]}.${ext}` : `mod.${ext}`;

    block.innerHTML = `
      <div class="ai-code-header">
        <span class="ai-code-lang">&#128196; ${lang.toUpperCase()} – ${fileName}</span>
        <div class="ai-code-actions">
          <button class="ai-code-btn install-btn" style="background: linear-gradient(135deg, #ff6600, #cc5200); color: #fff; font-weight: bold; border: none; padding: 4px 10px; border-radius: 5px; cursor: pointer;">⚡ ZAINSTALUJ GRYWALNY MOD</button>
          <button class="ai-code-btn copy-btn">&#128203; Kopiuj</button>
          <button class="ai-code-btn dl dl-btn">&#11123; Pobierz plik</button>
        </div>
      </div>
      <pre class="ai-code-pre">${highlight(code)}</pre>`;

    let generatedAssets = [];
    if (fullMessageText) {
      const regex = /\[TEXTURE:\s*(item|block):([a-zA-Z0-9_]+),\s*COLOR:\s*(#[0-9a-fA-F]{3,6})\s*\]/gi;
      let match;
      while ((match = regex.exec(fullMessageText)) !== null) {
        const type = match[1].toLowerCase();
        const id = match[2].toLowerCase();
        const color = match[3];
        
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, 0, 16, 1);
        ctx.fillRect(0, 0, 1, 16);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(15, 0, 1, 16);
        
        const base64 = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
        generatedAssets.push({ type, id, color, base64 });
      }
    }

    // Install playable mod directly into game / modpack
    block.querySelector('.install-btn').addEventListener('click', async () => {
      const btn = block.querySelector('.install-btn');
      btn.disabled = true;
      btn.textContent = 'Instalowanie...';
      try {
        const res = await window.electronAPI.installAiMod({
          gameDirectory: settings.gameDir,
          modName: fileName.replace(/\.[^/.]+$/, ''),
          code: code,
          type: lang,
          loader: aiLoaderSelect ? aiLoaderSelect.value : 'Fabric',
          generatedAssets: generatedAssets
        });
        if (res.success) {
          btn.textContent = '✓ ZAINSTALOWANO W GRZE!';
          btn.style.background = '#22c55e';
          addConsoleLog(`[GG AI] ${res.message}`);
          alert(res.message);
        } else {
          throw new Error(res.error);
        }
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '⚡ ZAINSTALUJ GRYWALNY MOD';
        alert(`Błąd instalacji moda: ${err.message}`);
      }
    });

    // Copy
    block.querySelector('.copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(code).then(() => {
        const b = block.querySelector('.copy-btn');
        b.textContent = '✓ Skopiowano!';
        setTimeout(() => { b.innerHTML = '&#128203; Kopiuj'; }, 1500);
      });
    });

    // Download
    block.querySelector('.dl-btn').addEventListener('click', () => {
      const blob = new Blob([code], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    });

    return block;
  }

  // ── Render AI message with code blocks ──────────────────
  function addAiMessage(role, text) {
    const wrap = document.createElement('div');
    wrap.className = `ai-msg ${role}`;
    const avatar = document.createElement('div');
    avatar.className = 'ai-msg-avatar';
    avatar.textContent = role === 'assistant' ? '🤖' : '👤';
    wrap.appendChild(avatar);

    // Container for bubble + code blocks
    const content = document.createElement('div');
    content.style.flex = '1';
    content.style.minWidth = '0';

    // Split by ```lang\n...\n```
    const parts = text.split(/(```[\w]*\n[\s\S]*?```)/g);
    parts.forEach(part => {
      const codeMatch = part.match(/^```([\w]*)\n([\s\S]*?)```$/);
      if (codeMatch) {
        content.appendChild(renderCodeBlock(codeMatch[2], codeMatch[1], text));
      } else if (part.trim()) {
        const bubble = document.createElement('div');
        bubble.className = 'ai-msg-bubble';
        bubble.innerHTML = part
          .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
          .replace(/`([^`]+)`/g,'<code>$1</code>')
          .replace(/\n/g,'<br>');
        content.appendChild(bubble);
      }
    });

    wrap.appendChild(content);
    aiChatWindow.appendChild(wrap);
    aiChatWindow.scrollTop = aiChatWindow.scrollHeight;
  }

  function addAiError(msg) {
    const d = document.createElement('div');
    d.className = 'ai-error-msg';
    d.textContent = '⚠️ ' + msg;
    aiChatWindow.appendChild(d);
    aiChatWindow.scrollTop = aiChatWindow.scrollHeight;
  }

  function showTyping() {
    const d = document.createElement('div');
    d.className = 'ai-msg assistant'; d.id = 'ai-typing-indicator';
    d.innerHTML = `<div class="ai-msg-avatar">🤖</div><div class="ai-typing"><span></span><span></span><span></span></div>`;
    aiChatWindow.appendChild(d);
    aiChatWindow.scrollTop = aiChatWindow.scrollHeight;
  }

  function hideTyping() {
    const t = document.getElementById('ai-typing-indicator');
    if (t) t.remove();
  }

  // ── Send to Gemini via IPC ──────────────────────────────
  async function sendToGemini(userText) {
    if (!aiApiKey) {
      addAiError('Brak klucza Gemini API! Wklej klucz w polu powyżej i kliknij Zapisz.');
      return;
    }
    if (!userText.trim()) return;

    const loader = aiLoaderSelect ? aiLoaderSelect.value : 'Forge';
    const mcver  = aiMcverSelect  ? aiMcverSelect.value  : '1.20.1';
    const systemPrompt = aiMode === 'modgen' ? getModgenPrompt(loader, mcver) : PROMPT_CHAT;

    aiChatHistory.push({ role: 'user', parts: [{ text: userText }] });
    addAiMessage('user', userText);
    btnAiSend.disabled = true; aiUserInput.disabled = true;
    showTyping();

    try {
      const result = await window.electronAPI.geminiChat({
        apiKey: aiApiKey,
        model: aiModelSelect.value,
        history: aiChatHistory,
        systemPrompt
      });

      hideTyping();

      if (!result.success) {
        addAiError(`Błąd Gemini API: ${result.error}`);
        aiChatHistory.pop();
        return;
      }

      aiChatHistory.push({ role: 'model', parts: [{ text: result.reply }] });
      addAiMessage('assistant', result.reply);

    } catch (err) {
      hideTyping();
      addAiError(`Błąd połączenia: ${err.message}`);
      aiChatHistory.pop();
    } finally {
      btnAiSend.disabled = false; aiUserInput.disabled = false;
      aiUserInput.focus();
    }
  }

  // ── Send button & keyboard ──────────────────────────────
  btnAiSend.addEventListener('click', () => {
    const text = aiUserInput.value.trim();
    if (!text) return;
    aiUserInput.value = ''; aiUserInput.style.height = 'auto';
    sendToGemini(text);
  });

  aiUserInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btnAiSend.click(); }
  });

  aiUserInput.addEventListener('input', () => {
    aiUserInput.style.height = 'auto';
    aiUserInput.style.height = Math.min(aiUserInput.scrollHeight, 120) + 'px';
  });

  // --- SKIN FACE CUTTER CONTROLLER ---
  const cutterFileInput = document.getElementById('cutter-file-input');
  const btnCutterFile = document.getElementById('btn-cutter-file');
  const cutterNickInput = document.getElementById('cutter-nick-input');
  const btnCutterFetch = document.getElementById('btn-cutter-fetch');
  const btnCutterActive = document.getElementById('btn-cutter-active');
  const cutterPreviewArea = document.getElementById('cutter-preview-area');
  const cutterPreview1x = document.getElementById('cutter-preview-1x');
  const cutterPreview8x = document.getElementById('cutter-preview-8x');
  const cutterPreview16x = document.getElementById('cutter-preview-16x');
  const btnCutterDownload64 = document.getElementById('btn-cutter-download-64');
  const btnCutterDownload128 = document.getElementById('btn-cutter-download-128');

  let cutFace64Data = '';
  let cutFace128Data = '';

  btnCutterFile.addEventListener('click', () => {
    cutterFileInput.click();
  });

  cutterFileInput.addEventListener('change', () => {
    const file = cutterFileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      processSkinImage(e.target.result);
      addConsoleLog(`[SYSTEM] Załadowano skin z komputera: ${file.name}`);
    };
    reader.readAsDataURL(file);
  });

  function processSkinImage(src) {
    const img = new Image();
    img.onload = () => {
      // Create 8x8 canvas to extract base head and overlay helm
      const canvas8 = document.createElement('canvas');
      canvas8.width = 8;
      canvas8.height = 8;
      const ctx8 = canvas8.getContext('2d');
      ctx8.imageSmoothingEnabled = false;

      // Draw base head: (8,8,8,8)
      ctx8.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);
      // Draw helm overlay: (40,8,8,8)
      ctx8.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);

      const url1x = canvas8.toDataURL('image/png');
      cutterPreview1x.src = url1x;

      // Create 64x64 canvas
      const canvas64 = document.createElement('canvas');
      canvas64.width = 64;
      canvas64.height = 64;
      const ctx64 = canvas64.getContext('2d');
      ctx64.imageSmoothingEnabled = false;
      ctx64.drawImage(canvas8, 0, 0, 8, 8, 0, 0, 64, 64);
      cutFace64Data = canvas64.toDataURL('image/png');
      cutterPreview8x.src = cutFace64Data;

      // Create 128x128 canvas
      const canvas128 = document.createElement('canvas');
      canvas128.width = 128;
      canvas128.height = 128;
      const ctx128 = canvas128.getContext('2d');
      ctx128.imageSmoothingEnabled = false;
      ctx128.drawImage(canvas8, 0, 0, 8, 8, 0, 0, 128, 128);
      cutFace128Data = canvas128.toDataURL('image/png');
      cutterPreview16x.src = cutFace128Data;

      // Reveal preview area
      cutterPreviewArea.classList.remove('hidden');
      addConsoleLog('[SYSTEM] Twarz została wycięta i wyrenderowana w podglądzie.');
    };
    img.onerror = () => {
      alert('Nie udało się wczytać skina. Upewnij się, że to prawidłowy plik graficzny Minecraft skin.');
    };
    img.src = src;
  }

  btnCutterFetch.addEventListener('click', async () => {
    const nick = cutterNickInput.value.trim();
    if (!nick) {
      alert('Wpisz nick gracza premium Minecraft!');
      return;
    }

    btnCutterFetch.disabled = true;
    btnCutterFetch.textContent = 'Pobieranie...';
    addConsoleLog(`[SYSTEM] Rozpoczynanie pobierania skina dla: ${nick}...`);

    try {
      const url = `https://mc-heads.net/skin/${nick}`;
      const res = await window.electronAPI.fetchImageBase64(url);
      if (res.success && res.base64) {
        processSkinImage(res.base64);
        addConsoleLog(`[SYSTEM] Pomyślnie pobrano i przetworzono skin gracza premium: ${nick}`);
      } else {
        throw new Error(res.error || 'Błąd odpowiedzi z backendu.');
      }
    } catch (err) {
      alert(`Nie udało się pobrać skina dla gracza ${nick}:\n${err.message}`);
      addConsoleLog(`[BŁĄD] Błąd pobierania skina dla ${nick}: ${err.message}`, true);
    } finally {
      btnCutterFetch.disabled = false;
      btnCutterFetch.textContent = 'Pobierz';
    }
  });

  btnCutterActive.addEventListener('click', async () => {
    const activeAccount = accounts.find(acc => acc.uuid === settings.activeAccountUuid);
    if (!activeAccount || !activeAccount.username) {
      alert('Nie znaleziono aktywnego konta gracza!');
      return;
    }

    if (activeAccount.type === 'Custom' && activeAccount.skinBase64) {
      processSkinImage(activeAccount.skinBase64);
      addConsoleLog(`[SYSTEM] Użytą własnego skina z aktywnego konta: ${activeAccount.username}`);
    } else {
      btnCutterActive.disabled = true;
      btnCutterActive.textContent = 'Pobieranie...';
      addConsoleLog(`[SYSTEM] Pobieranie skina dla aktywnego konta: ${activeAccount.username}...`);

      try {
        const url = `https://mc-heads.net/skin/${activeAccount.username}`;
        const res = await window.electronAPI.fetchImageBase64(url);
        if (res.success && res.base64) {
          processSkinImage(res.base64);
          addConsoleLog(`[SYSTEM] Pomyślnie pobrano skin aktywnego konta: ${activeAccount.username}`);
        } else {
          throw new Error(res.error || 'Błąd odpowiedzi z backendu.');
        }
      } catch (err) {
        alert(`Nie udało się pobrać skina dla aktywnego konta:\n${err.message}`);
        addConsoleLog(`[BŁĄD] Błąd pobierania skina aktywnego konta: ${err.message}`, true);
      } finally {
        btnCutterActive.disabled = false;
        btnCutterActive.textContent = 'Użyj obecnego';
      }
    }
  });

  function downloadBase64Image(base64Data, filename) {
    const link = document.createElement('a');
    link.href = base64Data;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  btnCutterDownload64.addEventListener('click', () => {
    if (!cutFace64Data) return;
    const nick = cutterNickInput.value.trim() || 'face';
    downloadBase64Image(cutFace64Data, `${nick}_face_64x64.png`);
    addConsoleLog('[SYSTEM] Pobrano plik twarzy (64x64px).');
  });

  btnCutterDownload128.addEventListener('click', () => {
    if (!cutFace128Data) return;
    const nick = cutterNickInput.value.trim() || 'face';
    downloadBase64Image(cutFace128Data, `${nick}_face_128x128.png`);
    addConsoleLog('[SYSTEM] Pobrano plik twarzy (128x128px).');
  });

  // ═══════════════════════════════════════ SKINS TAB LOGIC ═══════════════════════════════════════
  const skinsDropZone      = document.getElementById('skins-drop-zone');
  const skinsFileInput     = document.getElementById('skins-file-input');
  const skinsFileStatus    = document.getElementById('skins-file-status');
  const skinsPreviewContainer = document.getElementById('skins-preview-container');
  const skinsPreviewImg    = document.getElementById('skins-preview-img');
  const btnSkinsSave       = document.getElementById('btn-skins-save');
  const skinsActiveName    = document.getElementById('skins-active-name');
  const skinsActiveType    = document.getElementById('skins-active-type');
  const skinsActiveAvatar  = document.getElementById('skins-active-avatar');

  let skinsSelectedBase64 = '';

  // Refresh Skórki tab — called on nav click and after account changes
  function refreshSkinsTab() {
    // Rebuild account selector
    const sel = document.getElementById('skins-account-select');
    if (!sel) return;

    sel.innerHTML = '';
    if (!accounts || accounts.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'Brak kont — dodaj konto najpierw';
      opt.disabled = true;
      sel.appendChild(opt);
      return;
    }

    accounts.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc.uuid;
      opt.textContent = `${acc.username} (${acc.type || 'Offline'})`;
      if (acc.uuid === settings.activeAccountUuid) opt.selected = true;
      sel.appendChild(opt);
    });

    // Update avatar/name display based on currently selected account
    updateSkinsAccountPreview();
  }

  async function updateSkinsAccountPreview() {
    const sel = document.getElementById('skins-account-select');
    if (!sel || !accounts || accounts.length === 0) return;

    const selUuid = sel.value;
    const acc = accounts.find(a => a.uuid === selUuid) || accounts[0];
    if (!acc) return;

    if (skinsActiveName) skinsActiveName.textContent = acc.username;
    if (skinsActiveType) {
      const t = acc.type === 'Premium' ? 'Skin Premium' : acc.type === 'Custom' ? 'Własny Skin' : 'Offline';
      skinsActiveType.textContent = t;
    }
    if (skinsActiveAvatar) {
      if (acc.skinBase64) {
        const h = await getHeadFromSkinBase64(acc.skinBase64);
        skinsActiveAvatar.src = h || getDefaultAvatarUrl(acc.username, 80);
      } else if (acc.type === 'Premium') {
        skinsActiveAvatar.src = `https://mc-heads.net/avatar/${acc.username}/80`;
        skinsActiveAvatar.onerror = function() { this.onerror = null; this.src = getDefaultAvatarUrl(acc.username, 80); };
      } else {
        skinsActiveAvatar.src = getDefaultAvatarUrl(acc.username, 80);
      }
    }
  }

  if (skinsDropZone && skinsFileInput) {
    // Click drop zone triggers file input
    skinsDropZone.addEventListener('click', () => {
      skinsFileInput.click();
    });

    // Handle drag and drop style
    skinsDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      skinsDropZone.style.borderColor = 'var(--color-accent)';
      skinsDropZone.style.background = 'rgba(255, 255, 255, 0.05)';
    });

    skinsDropZone.addEventListener('dragleave', () => {
      skinsDropZone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      skinsDropZone.style.background = 'rgba(255, 255, 255, 0.01)';
    });

    skinsDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      skinsDropZone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      skinsDropZone.style.background = 'rgba(255, 255, 255, 0.01)';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        skinsFileInput.files = files;
        skinsFileInput.dispatchEvent(new Event('change'));
      }
    });

    // Account selector change
    const skinAccSel = document.getElementById('skins-account-select');
    if (skinAccSel) {
      skinAccSel.addEventListener('change', () => updateSkinsAccountPreview());
    }

    // File change handler
    skinsFileInput.addEventListener('change', () => {
      const file = skinsFileInput.files[0];
      if (!file) return;

      const ext = file.name.split('.').pop().toLowerCase();
      if (!['png', 'jpg', 'jpeg', 'bmp'].includes(ext)) {
        alert('Niedozwolony format! Wybierz plik .png, .jpg lub .bmp.');
        skinsFileInput.value = '';
        return;
      }

      skinsFileStatus.textContent = `Wczytywanie: ${file.name}...`;
      skinsFileStatus.style.color = 'var(--color-text-secondary)';

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 64; canvas.height = 64;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.clearRect(0, 0, 64, 64);
          if (img.width === 64 && img.height === 64) {
            ctx.drawImage(img, 0, 0, 64, 64);
          } else if (img.width === 64 && img.height === 32) {
            ctx.drawImage(img, 0, 0, 64, 32);
          } else {
            ctx.drawImage(img, 0, 0, 64, 64);
          }
          skinsSelectedBase64 = canvas.toDataURL('image/png');

          getHeadFromSkinBase64(skinsSelectedBase64).then(headUrl => {
            if (headUrl) {
              skinsPreviewImg.src = headUrl;
              skinsPreviewContainer.classList.remove('hidden');
            }
          });

          skinsFileStatus.textContent = `✓ Załadowano: ${file.name} (${img.width}×${img.height})`;
          skinsFileStatus.style.color = '#00ff66';
          if (btnSkinsSave) btnSkinsSave.removeAttribute('disabled');
        };
        img.onerror = () => {
          alert('Błąd wczytywania grafiki! Plik jest uszkodzony lub to nie jest grafika.');
          skinsFileStatus.textContent = 'Błąd pliku graficznego';
          skinsFileStatus.style.color = '#ef4444';
          if (btnSkinsSave) btnSkinsSave.setAttribute('disabled', 'true');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });

    // Save button handler
    if (btnSkinsSave) {
      btnSkinsSave.addEventListener('click', async () => {
        if (!skinsSelectedBase64) {
          alert('Najpierw wybierz plik skina!');
          return;
        }

        if (!accounts || accounts.length === 0) {
          alert('Brak kont w launcherze. Najpierw dodaj konto w sekcji Dashboard.');
          return;
        }

        // Find account from selector (or fall back to active account, then first account)
        const sel = document.getElementById('skins-account-select');
        const selUuid = sel ? sel.value : settings.activeAccountUuid;
        let targetAcc = accounts.find(a => a.uuid === selUuid)
                     || accounts.find(a => a.uuid === settings.activeAccountUuid)
                     || accounts[0];

        if (!targetAcc) {
          alert('Nie znaleziono konta. Dodaj konto w Dashboard.');
          return;
        }

        btnSkinsSave.disabled = true;
        btnSkinsSave.textContent = 'ZAPISYWANIE...';

        try {
          const idx = accounts.findIndex(a => a.uuid === targetAcc.uuid);
          if (idx !== -1) {
            accounts[idx].skinBase64 = skinsSelectedBase64;
            accounts[idx].type = 'Custom';
            localStorage.setItem('gg_launcher_accounts', JSON.stringify(accounts));

            // If we changed the ACTIVE account, refresh the dashboard avatar too
            if (accounts[idx].uuid === settings.activeAccountUuid) {
              await renderActiveAccount(accounts[idx]);
            }
            // Update skins tab preview
            await updateSkinsAccountPreview();
            // Refresh modal accounts list
            if (typeof renderAccountsList === 'function') renderAccountsList();

            addConsoleLog(`[SYSTEM] Zaktualizowano skórkę dla konta: ${accounts[idx].username}`);

            // Reset form
            skinsFileInput.value = '';
            skinsSelectedBase64 = '';
            skinsPreviewContainer.classList.add('hidden');
            skinsPreviewImg.src = '';
            skinsFileStatus.textContent = 'Kliknij tutaj, aby wybrać nowy plik';
            skinsFileStatus.style.color = 'var(--color-text-secondary)';
            btnSkinsSave.setAttribute('disabled', 'true');

            alert(`✓ Skórka dla konta "${accounts[idx].username}" została zmieniona!`);
          }
        } catch (err) {
          alert(`Błąd zapisu skórki: ${err.message}`);
        } finally {
          btnSkinsSave.disabled = false;
          btnSkinsSave.textContent = 'ZAPISZ NOWĄ SKÓRKĘ';
        }
      });
    }
    // SkinsRestorer generator logic
    const btnSkinsGenerateUrl = document.getElementById('btn-skins-generate-url');
    const skinsRestorerResult  = document.getElementById('skins-restorer-result');
    const skinsRestorerCmdInput = document.getElementById('skins-restorer-cmd-input');
    const btnSkinsCopyCmd      = document.getElementById('btn-skins-copy-cmd');

    if (btnSkinsGenerateUrl && skinsRestorerResult && skinsRestorerCmdInput && btnSkinsCopyCmd) {
      btnSkinsGenerateUrl.addEventListener('click', async () => {
        // Find which account we are working with
        const sel = document.getElementById('skins-account-select');
        const selUuid = sel ? sel.value : settings.activeAccountUuid;
        const targetAcc = accounts.find(a => a.uuid === selUuid)
                       || accounts.find(a => a.uuid === settings.activeAccountUuid)
                       || accounts[0];

        if (!targetAcc) {
          alert('Brak kont. Najpierw dodaj konto w sekcji Dashboard.');
          return;
        }

        // Get the skin base64 data. If we just uploaded a new one (skinsSelectedBase64 is set), use it.
        // Otherwise, look at targetAcc.skinBase64.
        const currentSkinBase64 = skinsSelectedBase64 || targetAcc.skinBase64;

        if (!currentSkinBase64) {
          alert('To konto nie ma wgranego własnego skina. Najpierw wybierz plik skina i kliknij "ZAPISZ NOWĄ SKÓRKĘ"!');
          return;
        }

        btnSkinsGenerateUrl.disabled = true;
        btnSkinsGenerateUrl.textContent = 'PRZESYŁANIE SKINA...';

        try {
          const res = await window.electronAPI.uploadSkinOnline(currentSkinBase64);
          if (res.success && res.url) {
            skinsRestorerCmdInput.value = `/skin url ${res.url}`;
            skinsRestorerResult.classList.remove('hidden');
            addConsoleLog(`[SYSTEM] Wygenerowano link do skina dla SkinsRestorer: ${res.url}`);
          } else {
            throw new Error(res.error || 'Nieznany błąd podczas przesyłania');
          }
        } catch (err) {
          alert(`Błąd generowania linku: ${err.message}\nUpewnij się, że masz połączenie z internetem.`);
        } finally {
          btnSkinsGenerateUrl.disabled = false;
          btnSkinsGenerateUrl.textContent = 'WYGENERUJ KOMENDĘ DLA SERWERA (/skin url)';
        }
      });

      btnSkinsCopyCmd.addEventListener('click', () => {
        skinsRestorerCmdInput.select();
        skinsRestorerCmdInput.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(skinsRestorerCmdInput.value);
        
        const oldText = btnSkinsCopyCmd.textContent;
        btnSkinsCopyCmd.textContent = 'SKOPIOWANO!';
        btnSkinsCopyCmd.style.background = '#00ff66';
        btnSkinsCopyCmd.style.color = '#000';
        
        setTimeout(() => {
          btnSkinsCopyCmd.textContent = oldText;
          btnSkinsCopyCmd.style.background = '';
          btnSkinsCopyCmd.style.color = '';
        }, 2000);
      });
    }
  }

  // Developer Auto-Update Panel handler
  if (typeof window.electronAPI.isDeveloper === 'function') {
    window.electronAPI.isDeveloper().then(isDev => {
      if (isDev) {
        const devCard = document.getElementById('dev-card');
        if (devCard) devCard.classList.remove('hidden');

        const btnReleaseUpdate = document.getElementById('btn-release-update');
        const devReleaseLog    = document.getElementById('dev-release-log');

        if (btnReleaseUpdate && devReleaseLog) {
          // Listen to compiler/uploader status reports
          window.electronAPI.onReleaseStatus((msg) => {
            const line = document.createElement('div');
            line.textContent = msg;
            devReleaseLog.appendChild(line);
            devReleaseLog.scrollTop = devReleaseLog.scrollHeight;
          });

          btnReleaseUpdate.addEventListener('click', async () => {
            const confirmRelease = confirm("Czy na pewno chcesz zbudować nową wersję i opublikować przymusową aktualizację dla wszystkich?");
            if (!confirmRelease) return;

            btnReleaseUpdate.disabled = true;
            devReleaseLog.innerHTML = '';
            devReleaseLog.classList.remove('hidden');

            const result = await window.electronAPI.releaseUpdate();
            btnReleaseUpdate.disabled = false;

            if (result.success) {
              alert(`✓ Pomyślnie opublikowano nową wersję v${result.version}! Wszyscy gracze zostaną zaktualizowani przy następnym uruchomieniu.`);
            } else {
              alert(`❌ Błąd publikowania aktualizacji: ${result.error}`);
            }
          });
        }
      }
    });
  }

  // Initialization sequence
  loadSettings();
  fetchVersions();
});

