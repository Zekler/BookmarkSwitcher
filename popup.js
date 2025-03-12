document.addEventListener('DOMContentLoaded', function() {
  const folderSelect = document.getElementById('bookmarkFolder');
  const switchButton = document.getElementById('switchButton');
  const messageDiv = document.getElementById('message');
  const favoritesUl = document.getElementById('favorites-ul');
  const noFavoritesMessage = document.getElementById('no-favorites-message');
  const saveFolderButtonIconElement = document.getElementById('saveFolderButtonIcon'); // Get button element


  // --- Populate Folder Dropdown ---
  function populateFolderDropdown() {
      console.log("Before getTree in populateFolderDropdown");
      chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
          console.log("Inside getTree callback", bookmarkTreeNodes);
          const rootNode = bookmarkTreeNodes[0]; // Root node is always the first element
          const otherNode = rootNode.children.find(i => i.id === '2'); // Other Bookmarks node is always the second element
          function traverseTree(node, selectElement) {
              if (node.children) {
                  if (node.parentId === '2') { // Exclude Root, Bookmarks Bar, Other Bookmarks - adjust as needed
                      let option = document.createElement('option');
                      option.value = node.id;
                      option.textContent = node.title || "Unnamed Folder";
                      selectElement.appendChild(option);
                  }
                  for (let child of node.children) {
                      traverseTree(child, selectElement);
                  }
              }
          }
          traverseTree(otherNode, folderSelect); // Use 'folderSelect' (which is bookmarkFolder)

          // Load and set the previously selected folder
          chrome.storage.local.get(['selectedFolderId', 'favorites'], function(result) {
              if (result.selectedFolderId) {
                  folderSelect.value = result.selectedFolderId;
                  // --- NEW: Add checkmark indicator to dropdown option after population ---
                  const selectedOption = Array.from(folderSelect.options).find(opt => opt.value === result.selectedFolderId);
                  if (selectedOption) {
                      selectedOption.textContent = "\u2713 " + selectedOption.textContent; // Add checkmark using Unicode
                  }
                  // After setting the selected folder, update the star icon
                  updateStarIcon(result.selectedFolderId, result.favorites || []); // Pass favorites here
              }
          });
      });
  }

  populateFolderDropdown();


  // Function to update star icon based on favorite status
  function updateStarIcon(selectedFolderId, favorites) {
      const isFavorited = favorites.some(fav => fav.folderId === selectedFolderId);
      if (isFavorited) {
          saveFolderButtonIconElement.classList.remove('star-outline-icon');
          saveFolderButtonIconElement.classList.add('star-filled-icon');
      } else {
          saveFolderButtonIconElement.classList.remove('star-filled-icon');
          saveFolderButtonIconElement.classList.add('star-outline-icon');
      }
  }


  // --- REMOVED:  `folderSelect 'change'` event listener ---
  // --- Save selected folder ID and update star icon when dropdown changes (NO INDICATOR UPDATE HERE NOW) ---
  folderSelect.addEventListener('change', function() {
    //  const selectedFolderId = folderSelect.value;
    //  chrome.storage.local.set({ 'selectedFolderId': selectedFolderId });
      chrome.storage.local.get(['favorites'], function(result) { // Get favorites here to check status
          updateStarIcon(folderSelect.value, result.favorites || []); // Update icon on dropdown change
      });
  });


  // --- Button click handler for switching bookmarks (INDICATOR ADDED HERE ON SUCCESS) ---
  switchButton.addEventListener('click', function() {
      const selectedFolderId = folderSelect.value;
      if (!selectedFolderId) {
          messageDiv.textContent = "Please select a bookmark folder.";
          return;
      }

      // --- NEW CHECK: Prevent switching to the same active folder ---
      chrome.storage.local.get(['selectedFolderId'], function(result) {
          const currentSelectedFolderId = result.selectedFolderId;
          if (selectedFolderId === currentSelectedFolderId) {
              messageDiv.textContent = "This folder is already active."; // Inform user
              return; // Exit, do not proceed with switch
          }

          messageDiv.textContent = "Switching bookmarks...";
          chrome.runtime.sendMessage({
              action: "switchBookmarks",
              folderId: selectedFolderId
          }, function(response) {
              if (chrome.runtime.lastError) {
                  messageDiv.textContent = "Error switching bookmarks: " + chrome.runtime.lastError.message;
              } else if (response && response.success) {
                  messageDiv.textContent = "Bookmarks switched successfully!";

                  // --- NEW: Add indicator to dropdown on successful switch ---
                  // --- Clear previous active indicator ---
                  for (let i = 0; i < folderSelect.options.length; i++) {
                      let option = folderSelect.options[i];
                      option.textContent = option.textContent.replace(/^✓ /, ''); // Remove checkmark at start
                      // If you added indicator at the end, use: option.textContent = option.textContent.replace(/ ✓$/, '');
                  }
                  // --- Add indicator to newly active option ---
                  const selectedOption = folderSelect.options[folderSelect.selectedIndex];
                  if (selectedOption) { // Check if selectedOption is not null
                      selectedOption.textContent = "✓ " + selectedOption.textContent;
                  }
                  // --- End of NEW section ---

                  loadFavorites(); // <-------  RE-LOAD FAVORITES AFTER SUCCESSFUL SWITCH
              } else {
                  // --- MODIFIED ERROR MESSAGE DISPLAY ---
                  if (response && response.error) {
                      messageDiv.textContent = `Bookmark switch failed: ${response.error}`; // Display error message from background.js
                  } else {
                      messageDiv.textContent = "Failed to switch bookmarks.";
                  }
              }
          });
      });
  });


  // Function to switch bookmarks to a favorite folder
  function switchToFavorite(favoriteFolderId) {
      // --- NEW CHECK: Prevent switching to the same active folder ---
      chrome.storage.local.get(['selectedFolderId'], function(result) {
          const currentSelectedFolderId = result.selectedFolderId;
          if (favoriteFolderId === currentSelectedFolderId) {
              messageDiv.textContent = "This folder is already active."; // Inform user
              return; // Exit, do not proceed with switch
          }

          messageDiv.textContent = "Switching to favorite...";
          chrome.runtime.sendMessage({ action: "switchBookmarks", folderId: favoriteFolderId }, function(response) {
              if (response && response.success) {
                  messageDiv.textContent = "Bookmarks switched to favorite!";
                   // --- NEW: Update dropdown indicator after switching to favorite ---
                  // --- Clear previous active indicator ---
                  for (let i = 0; i < folderSelect.options.length; i++) {
                      let option = folderSelect.options[i];
                      option.textContent = option.textContent.replace(/^✓ /, ''); // Remove checkmark at start
                  }
                  // --- Add indicator to newly active option ---
                  const selectedOption = Array.from(folderSelect.options).find(opt => opt.value === favoriteFolderId); // Find option by value
                  if (selectedOption) {
                      selectedOption.textContent = "✓ " + selectedOption.textContent;
                      folderSelect.value = favoriteFolderId; // Also ensure dropdown value is set correctly in case it wasn't already
                  }
                  // --- End of NEW section ---

                  loadFavorites(); // <-------  ADD THIS LINE: RE-LOAD FAVORITES AFTER SUCCESSFUL SWITCH
              } else if (response && response.error) {
                  messageDiv.textContent = `Bookmark switch to favorite failed: ${response.error}`;
              } else {
                  messageDiv.textContent = "Bookmark switch failed.";
              }
          });
      });
  }


  // Function to add current selected folder as a favorite (Same as before - button ID corrected)
  saveFolderButtonIconElement.addEventListener('click', function() {
      const selectedFolderId = folderSelect.value;
      const selectedFolderOption = folderSelect.options[folderSelect.selectedIndex];
      const selectedFolderTitle = selectedFolderOption.textContent.replace(/^✓ /, ''); // Remove indicator before saving
     // console.log("saveFolderButtonIconElement click - Before adding favorite, selectedFolderId:", selectedFolderId, "favorites before:", result.favorites); // ADDED CONSOLE LOG

      if (selectedFolderId) {
          chrome.storage.local.get(['favorites'], function(result) {
              let favorites = result.favorites || [];
              console.log("saveFolderButtonIconElement click - Retrieved favorites from storage:", favorites); // ADDED CONSOLE LOG
              const alreadyFavorited = favorites.some(fav => fav.folderId === selectedFolderId);
              if (alreadyFavorited) {
                  messageDiv.textContent = 'This folder is already in favorites.';
                  return;
              }

              const newFavorite = { title: selectedFolderTitle, folderId: selectedFolderId };
              favorites.push(newFavorite);
              console.log("saveFolderButtonIconElement click - Favorites array before saving:", favorites); // ADDED CONSOLE LOG
              chrome.storage.local.set({ favorites: favorites }, function() {
                  console.log("saveFolderButtonIconElement click - Favorites saved to storage:", favorites); // ADDED CONSOLE LOG
                  loadFavorites();
                  messageDiv.textContent = 'Current folder added to favorites!';
                  updateStarIcon(selectedFolderId, favorites); // Update star to filled on add
              });
          });
      } else {
          messageDiv.textContent = 'Please select a bookmark folder from the dropdown first.';
      }
  });


  // Function to remove a favorite (Same as before)
  function removeFavorite(event) {
      const indexToRemove = event.target.dataset.index;
      console.log("removeFavorite - Index to remove:", indexToRemove); // ADDED CONSOLE LOG
      chrome.storage.local.get(['favorites'], function(result) {
          let favorites = result.favorites || [];
          console.log("removeFavorite - Retrieved favorites from storage:", favorites); // ADDED CONSOLE LOG
          if (indexToRemove >= 0 && indexToRemove < favorites.length) {
              const removedFavorite = favorites.splice(indexToRemove, 1); // Store removed favorite for logging
              console.log("removeFavorite - Favorites array after removing:", favorites, "removed:", removedFavorite); // ADDED CONSOLE LOG
              chrome.storage.local.set({ favorites: favorites }, function() {
                  console.log("removeFavorite - Favorites saved to storage:", favorites); // ADDED CONSOLE LOG
                  loadFavorites();
                  messageDiv.textContent = 'Favorite removed.';
                  chrome.storage.local.get(['selectedFolderId'], function(result) { // Update star on remove
                      if (result.selectedFolderId) {
                          updateStarIcon(result.selectedFolderId, favorites); // Use updated favorites list
                      }
                  });
              });
          }
      });
  }


  // --- Function to load and display favorites list (DEFINITION - IMPORTANT!) ---
  function loadFavorites() {
      console.log("loadFavorites function called"); // ADDED CONSOLE LOG
      favoritesUl.innerHTML = ''; // Clear the current list
      chrome.storage.local.get(['favorites', 'selectedFolderId'], function(result) {
          let favorites = result.favorites || [];
          const selectedFolderId = result.selectedFolderId; // Get selectedFolderId for active indicator
          console.log("loadFavorites - Retrieved favorites from storage:", favorites, "Selected folder ID:", selectedFolderId); // ADDED CONSOLE LOG

          if (favorites.length > 0) {
              noFavoritesMessage.style.display = 'none'; // Hide message
              favoritesUl.style.display = 'block'; // Show the list
              favorites.forEach(function(favorite, index) {
                  const li = document.createElement('li');
                  const favButton = document.createElement('button');
                  favButton.textContent = favorite.title;
                  favButton.classList.add('favorite-button');
                  favButton.dataset.folderId = favorite.folderId; // Store folderId in dataset
                  favButton.addEventListener('click', function() {
                      const folderId = this.dataset.folderId;
                      console.log("Favorite button clicked for:", favorite.title, "folderId:", folderId); // ADDED CONSOLE LOG
                      switchToFavorite(folderId);
                  });

                  // Add active indicator (checkmark) if this favorite is the selected folder
                  if (selectedFolderId && favorite.folderId === selectedFolderId) {
                      favButton.textContent = "✓ " + favButton.textContent; // Add checkmark
                  }


                  const removeButton = document.createElement('button');
                  removeButton.textContent = 'X';
                  removeButton.classList.add('remove-favorite-button');
                  removeButton.dataset.index = index; // Store index to remove
                  removeButton.addEventListener('click', removeFavorite);

                  li.appendChild(favButton);
                  li.appendChild(removeButton);
                  favoritesUl.appendChild(li);
                  console.log("loadFavorites - Creating button for favorite:", favorite.title, "folderId:", favorite.folderId); // ADDED CONSOLE LOG
              });
          } else {
              noFavoritesMessage.style.display = 'block'; // Show message
              favoritesUl.style.display = 'none'; // Hide the list
          }
          chrome.storage.local.get(['selectedFolderId'], function(result) { // Update star on load
              if (result.selectedFolderId) {
                  updateStarIcon(result.selectedFolderId, favorites); // Use loaded favorites list
              }
          });
      });
  }


  // Load favorites when popup is opened initially (Call loadFavorites on DOMContentLoaded)
  loadFavorites();
});