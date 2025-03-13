document.addEventListener('DOMContentLoaded', function() {
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

    function updateStarIcon(selectedFolderId, favorites) {
        const starSvg = saveFolderButtonIcon.querySelector('svg');
        const isFavorited = favorites.some(fav => fav.folderId === selectedFolderId);

        if (isFavorited) {
            starSvg.innerHTML = '<path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"/>';
            starSvg.setAttribute('class', 'bi bi-star-fill');
        } else {
            starSvg.innerHTML = '<path d="M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.386.198.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.56.56 0 0 0-.163-.505L1.71 6.745l4.052-.576a.53.53 0 0 0 .393-.288L8 2.223l1.847 3.658a.53.53 0 0 0 .393.288l4.052.575-2.906 2.77a.56.56 0 0 0-.163.506l.694 3.957-3.686-1.894a.5.5 0 0 0-.461 0z"/>';
            starSvg.setAttribute('class', 'bi bi-star');
        }
    }
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
    
        chrome.storage.local.get(['selectedFolderId', 'favorites'], function(result) {
            if (result.selectedFolderId) {
                folderSelect.value = result.selectedFolderId;
                const selectedOption = Array.from(dropdownOptions.querySelectorAll('.custom-dropdown-option')).find(opt => opt.dataset.value === result.selectedFolderId);
                if (selectedOption) {
                    selectedSpan.textContent = selectedOption.textContent;
                    selectedOption.classList.add('selected');
                }
            }
            updateStarIcon(result.selectedFolderId, result.favorites || []);
        });
    }

    // --- Populate Favorites List ---
    function populateFavoritesList() {
        chrome.storage.local.get(['favorites'], function(result) {
            const favorites = result.favorites || []; // Provide an empty array as a default
            favoritesList.innerHTML = '';
            if (favorites.length === 0) {
                noFavoritesMessage.style.display = 'block';
            } else {
                noFavoritesMessage.style.display = 'none';
                favorites.forEach(fav => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <button class="btn favorite-button" data-folder-id="${fav.folderId}">${fav.folderName}</button>
                        <button class="btn remove-favorite" data-folder-id="${fav.folderId}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-x-lg" viewBox="0 0 16 16">
  <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
</svg></button>
                    `;
                    favoritesList.appendChild(li);
                });
            }
        });
    }
     // --- Event Listeners ---
     document.addEventListener('click', function(event) {
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

            chrome.storage.local.get(['favorites'], function(result) {
                updateStarIcon(value, result.favorites || []);
            });
        }

        if (target.classList.contains('favorite-button')) {
            const folderId = target.dataset.folderId;
            folderSelect.value = folderId;
            chrome.bookmarks.get(folderId, function(folder) {
                if (chrome.runtime.lastError) {
                    console.error("Error in chrome.bookmarks.get:", chrome.runtime.lastError.message);
                    displayMessage("Error retrieving folder information.", true);
                    return;
                }
                if (folder && folder[0]) {
                    document.querySelector('.custom-dropdown-trigger span').textContent = folder[0].title;
                    const selectedOption = document.querySelector(`.custom-dropdown-option[data-value="${folderId}"]`);
                    if (selectedOption) {
                        document.querySelectorAll('.custom-dropdown-option').forEach(option => option.classList.remove('selected'));
                        selectedOption.classList.add('selected');
                    }
                    chrome.storage.local.get(['favorites'], function(result) {
                        updateStarIcon(folderId, result.favorites || []);
                        setActiveFavorite(folderId);
                    });
                    chrome.runtime.sendMessage({ action: "switchBookmarks", folderId: folderId }, function(response) {
                        if (response && response.success) {
                            displayMessage("Bookmarks switched successfully!");
                        } else if (response && response.error) {
                            displayMessage(response.error, true);
                        } else {
                            displayMessage("An unknown error occurred.", true);
                        }
                    });
                }
            });
        }
        const removeFavoriteButton = target.closest('.remove-favorite');
        if (removeFavoriteButton) {
            const folderId = removeFavoriteButton.dataset.folderId;
            chrome.storage.local.get(['favorites'], function(result) {
                let favorites = result.favorites || [];
                favorites = favorites.filter(fav => fav.folderId !== folderId);
                chrome.storage.local.set({ favorites: favorites }, function() {
                    populateFavoritesList();
                    chrome.storage.local.get(['selectedFolderId'], function(result) {
                        updateStarIcon(result.selectedFolderId, favorites);
                    });
                });
            });
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
            } else if (response && response.error) {
                displayMessage(response.error, true);
            } else {
                displayMessage("An unknown error occurred.", true);
            }
        });
    });

    saveFolderButtonIcon.addEventListener('click', function() {
        const folderId = folderSelect.value;
        chrome.bookmarks.get(folderId, function(folder) {
            if (folder && folder.length > 0) { // Check if folder exists
                const folderName = folder[0].title;
                chrome.storage.local.get(['favorites'], function(result) {
                    let favorites = result.favorites || [];
                    const isFavorited = favorites.some(fav => fav.folderId === folderId);
                    if (isFavorited) {
                        favorites = favorites.filter(fav => fav.folderId !== folderId);
                    } else {
                        favorites.push({ folderId: folderId, folderName: folderName });
                    }
                    chrome.storage.local.set({ favorites: favorites }, function() {
                        populateFavoritesList();
                        updateStarIcon(folderId, favorites);
                    });
                });
            } else {
                displayMessage("Folder not found.",true);
            }
        });
    });
    // --- Add this function to your popup.js to set the initial active state ---
    function setActiveFavorite(folderId) {
        document.querySelectorAll('.favorite-button').forEach(btn => btn.classList.remove('active-favorite'));
        const activeFavButton = document.querySelector(`.favorite-button[data-folder-id="${folderId}"]`);
        if (activeFavButton) {
            activeFavButton.classList.add('active-favorite');
        }
        document.querySelectorAll('.custom-dropdown-option').forEach(btn => btn.classList.remove('active'));
        const activeDDButton = document.querySelector(`.custom-dropdown-option[data-value="${folderId}"]`);
        if (activeDDButton) {
            activeDDButton.classList.add('active');
        }
    }


    // --- Initial Population ---
    populateFolderDropdown();
    populateFavoritesList();
        // --- Call this function when the popup is loaded (e.g., in your popup.js onload event) ---
        chrome.storage.local.get(['selectedFolderId'], function(result) {
            const selectedFolderId = result.selectedFolderId;
            if (selectedFolderId) {
                setActiveFavorite(selectedFolderId);
            }
        });
    
});