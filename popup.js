document.addEventListener('DOMContentLoaded', async function() {
    chrome.storage.onChanged.addListener(function(changes, areaName) {
        if (areaName === 'local' && changes.selectedFolder) {
            const updatedSelectedFolder = changes.selectedFolder.newValue;
            if (updatedSelectedFolder && updatedSelectedFolder.id) {
                setActiveFolderById(updatedSelectedFolder.id);
            }
        }
    });
    // --- Variables ---
    const switchButton = document.getElementById('switchButton');
    const saveFolderButtonIcon = document.getElementById('saveFolderButtonIcon');
    const favoritesList = document.getElementById('favorites-ul');
    const noFavoritesMessage = document.getElementById('no-favorites-message');
    const folderSelect = document.getElementById('bookmarkFolder');
    const messageDiv = document.getElementById('message');

    // --- Helper Functions ---
    function displayMessage(message, isError = false) {
        messageDiv.textContent = message;
        messageDiv.className = isError ? 'error' : 'success';
        setTimeout(() => {
            messageDiv.textContent = '';
            messageDiv.className = '';
        }, 3000);
    }
    // --- Update Star Icon ---
    async function updateStarIcon() {
        try {
            const selectedDropdownOption = document.querySelector('.custom-dropdown-option.selected');
            const starSvg = saveFolderButtonIcon.querySelector('svg');
            let isStarred = false; // Initialize to false
    
            if (selectedDropdownOption) {
                const selectedFolderId = selectedDropdownOption.dataset.value;
                const localResult = await chrome.storage.local.get({ favorites: [] });
                const localFavorites = localResult.favorites;
    
                isStarred = localFavorites && localFavorites.some(fav => fav.id === selectedFolderId);
            }
    
            if (isStarred) {
                starSvg.innerHTML = '<path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"/>';
                starSvg.setAttribute('class', 'bi bi-star-fill');
            } else {
                starSvg.innerHTML = '<path d="M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.386.198.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.56.56 0 0 0-.163-.505L1.71 6.745l4.052-.576a.53.53 0 0 0 .393-.288L8 2.223l1.847 3.658a.53.53 0 0 0 .393.288l4.052.575-2.906 2.77a.56.56 0 0 0-.163.506l.694 3.957-3.686-1.894a.5.5 0 0 0-.461 0z"/>';
                starSvg.setAttribute('class', 'bi bi-star');
            }
    
        } catch (error) {
            console.error("Error updating star icon:", error);
        }
    }
    // --- Populate Folder Dropdown ---
    function populateFolderDropdown() {
        const dropdownOptions = document.querySelector('.custom-dropdown-options');
        const defaultDropDownOption = document.getElementById('defaultDropDownOption');
        const selectedSpan = document.querySelector('.custom-dropdown-trigger span');
    
        dropdownOptions.innerHTML = '';
        dropdownOptions.appendChild(defaultDropDownOption);
    
        // Function to recursively traverse the bookmarks tree
        function traverseBookmarks(folderId, dropdownElement) {
            chrome.bookmarks.getChildren(folderId, function(children) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError);
                    return;
                }
    
                if (children) {
                    for (const child of children) {
                        if (!child.url) {
                            if (child.parentId === '2' || folderId === '2') {
                                // Check if the parent is 'Other Bookmarks' or current folder is 'Other Bookmarks'
                                let option = document.createElement('div');
                                option.className = 'custom-dropdown-option';
                                option.dataset.value = child.id;
                                option.textContent = child.title || "Unnamed Folder";
                                dropdownElement.appendChild(option);
                            }
                            traverseBookmarks(child.id, dropdownElement); // Recursive call for subfolders
                        }
                    }
                }
            });
        }
    
        // Start traversing from the "Other Bookmarks" folder (ID: '2')
        traverseBookmarks('2', dropdownOptions);

    }
    // --- Populate Favorites List ---
    async function populateFavoritesList() {
        const localResult = await chrome.storage.local.get({ favorites: [] });
        const localFavorites = localResult.favorites;
    
        favoritesList.innerHTML = '';
        if (localFavorites.length === 0) {
            noFavoritesMessage.style.display = 'block';
        } else {
            noFavoritesMessage.style.display = 'none';
            for (let i = 0; i < localFavorites.length; i++) {
                const localFavorite = localFavorites[i];
                try {
                    const folder = await new Promise((resolve) => {
                        chrome.bookmarks.get(localFavorite.id, (folder) => {
                            resolve(folder);
                        });
                    });
                    if (folder && folder.length > 0) {
                        const listItem = document.createElement('li');
                        listItem.innerHTML = `
                            <button class="btn favorite-button" data-folderid="${localFavorite.id}">${folder[0].title}</button>
                            <button class="btn remove-favorite" data-folderid="${localFavorite.id}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-x-lg" viewBox="0 0 16 16">
                                <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8 8.707l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
                            </svg></button>
                        `;
                        favoritesList.appendChild(listItem);
                    }
                } catch (error) {
                    console.error("Error retrieving folder:", error);
                }
            }
        }
    }
    // --- Initialize Selected Folder ---
    async function initializeSelectedFolder() {
        try {
            const localResult = await chrome.storage.local.get({ selectedFolder: null });
            const localSelectedFolder = localResult.selectedFolder;
    
            if (localSelectedFolder && localSelectedFolder.id) {
                await setActiveFolderById(localSelectedFolder.id);
            }
    
        } catch (error) {
            console.error("Error initializing selected folder:", error);
        }
    }
     // --- Event Listeners ---
     document.addEventListener('click', async function(event) {
        const dropdown = document.querySelector('.custom-dropdown');
        const dropdownOptions = document.querySelector('.custom-dropdown-options');
        const dropdownTrigger = document.querySelector('.custom-dropdown-trigger');
        const target = event.target;
    
    
        if (dropdownTrigger.contains(target)) {
            dropdownOptions.classList.toggle('show');
        } else if (!dropdown.contains(target)) {
            dropdownOptions.classList.remove('show');
        }
    
        if (target.classList.contains('custom-dropdown-option')) {
            const value = target.dataset.value;
            folderSelect.value = value;
            document.querySelector('.custom-dropdown-trigger span').textContent = target.textContent;
            dropdownOptions.classList.remove('show');

            dropdownOptions.querySelectorAll('.custom-dropdown-option').forEach(option => {
                option.classList.remove('selected');
            });
            target.classList.add('selected');

            updateStarIcon();
        }
        
        if (target.classList.contains('favorite-button')) {
            const folderId = event.target.dataset.folderid;
            try {
                chrome.runtime.sendMessage({
                    action: "switchBookmarks",
                    folderId: folderId
                }, async (response) => {
                    console.log("removeResponse: ", response);
                    if (!response) {
                        console.error("Error removing favorites: No response received.");
                        return; // Exit early
                    }
                    
                    if (response.success) {
                        await setActiveFolderById(folderId);
                    } else {
                        console.error("Error removing favorites:", response.error);
                    }
                });
    
            } catch (error) {
                console.error("Error handling favorite button click:", error);
                displayMessage("An error occurred.", true);
            }
        }
        const removeFavoriteButton = target.closest('.remove-favorite');
        if (removeFavoriteButton) {
            const folderId = removeFavoriteButton.dataset.folderid;
            try {
                chrome.runtime.sendMessage({
                    action: "removeFavorite",
                    folderId: folderId
                }, (response) => {
                    console.log("removeResponse: ", response);
                    if (!response) {
                        console.error("Error removing favorites: No response received.");
                        return; // Exit early
                    }
                    
                    if (response.success) {
                        populateFavoritesList();
                        updateStarIcon();
                    } else {
                        console.error("Error removing favorites:", response.error);
                    }
                });
            } catch (error) {
                console.error("Error removing favorite:", error);
                displayMessage("An error occurred while removing.", true);
            }
        }
    });
   
    switchButton.addEventListener('click', function() {
        const folderId = folderSelect.value;
        if (!folderId || folderId === "0") {
            displayMessage("Please select a valid folder.", true);
            return;
        }
        chrome.runtime.sendMessage({ action: "switchBookmarks", folderId: folderId }, function(response) {
            if (response && response.success) {
                displayMessage("Bookmarks switched successfully!");
                setActiveFolderById(folderId);
            } else if (response && response.error) {
                displayMessage(response.error, true);
            } else {
                displayMessage("An unknown error occurred.", true);
            }
        });
    });

    saveFolderButtonIcon.addEventListener('click', async function() {
        const folderId = folderSelect.value;
        if (!folderId || folderId === "0") {
            displayMessage("Please select a valid folder.", true);
            return;
        }
    
        try {
            const folder = await new Promise((resolve) => {
                chrome.bookmarks.get(folderId, (folder) => {
                    resolve(folder);
                });
            });
            const folderName = folder[0].title;
            const index = folder[0].index;
    
            await chrome.runtime.sendMessage({
                action: "setFavorites",
                name: folderName,
                index: index,
                folderId: folderId,
            }, (response) => {
                if (!response) {
                    console.error("Error setting favorites: No response received.");
                    return; // Exit early
                }
                
                if (response.success) {
                    populateFavoritesList();
                    updateStarIcon();
                } else {
                    console.error("Error setting favorites:", response.error);
                }
            });
        } catch (error) {
            console.error("Error saving favorite:", error);
            displayMessage("An error occurred while saving.", true);
        }
    });

    async function setActiveFolderById(folderId) {
        try {
            document.querySelectorAll('.active-favorite, .active').forEach(el => el.classList.remove('active-favorite', 'active'));
            const activeFavButton = document.querySelector(`.favorite-button[data-folderid="${folderId}"]`);
            const activeDropDownOption = document.querySelector(`.custom-dropdown-option[data-value="${folderId}"]`);
            if (activeFavButton) {
                activeFavButton.classList.add('active-favorite');
            }
            if (activeDropDownOption){
                activeDropDownOption.classList.add('active');
            }
        } catch (error) {
            console.error("Error setting active favorite:", error);
            displayMessage("An error occurred.", true);
        }
    }
    // --- Initial Population ---
    populateFolderDropdown();
    await populateFavoritesList();
    await initializeSelectedFolder();
});
