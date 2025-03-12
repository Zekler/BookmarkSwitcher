chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "switchBookmarks") {
        const targetFolderId = request.folderId;
        console.log("Message received: switchBookmarks to folderId:", targetFolderId);
        switchBookmarks(targetFolderId, sendResponse);
        return true; // Indicate we will send response asynchronously
    }
});


function switchBookmarks(targetFolderId, sendResponse) {
    console.log("switchBookmarks function started, targetFolderId:", targetFolderId);
    chrome.storage.local.get(['selectedFolderId'], function(result) {
        let currentFolderId = result.selectedFolderId;
        console.log("  - Retrieved currentFolderId from storage:", currentFolderId);

        if (!currentFolderId) {
            console.log("  - No currentFolderId found in storage, proceeding to switch directly.");
            performSwitch(targetFolderId, sendResponse, null); // Pass null for no previous folder
            return;
        }

        // --- NEW: Check if currentFolderId still exists ---
        chrome.bookmarks.get(currentFolderId, function(currentFolderNode) {
            if (chrome.runtime.lastError || !currentFolderNode) {
                console.warn("  - Current folder (ID:", currentFolderId, ") not found or error accessing it. Skipping save changes for previous folder.");
                currentFolderId = null; // Treat as if there was no previous folder
                performSwitch(targetFolderId, sendResponse, null); // Proceed with switch, no previous folder to save to
                return; // Important: Exit this callback to prevent further execution in this branch
            }

            console.log("  - Current folder (ID:", currentFolderId, ") exists. Proceeding to save changes.");

            // --- 2 & 3. Fetch Bookmarks ---
            Promise.all([
                getBookmarksInFolder('1'), // Bookmarks Bar (ID '1')
                getBookmarksInFolder(currentFolderId) // Currently active folder
            ]).then(([bookmarkBarBookmarks, currentFolderBookmarks]) => {
                console.log("  - Fetched Bookmarks - Bookmark Bar:", bookmarkBarBookmarks);
                console.log("  - Fetched Bookmarks - Current Folder:", currentFolderBookmarks);

                // --- 4. Update Currently Active Folder ---
                console.log("  - Calling updateFolderBookmarks for folderId:", currentFolderId);
                updateFolderBookmarks(currentFolderId, bookmarkBarBookmarks, currentFolderBookmarks)
                    .then(() => {
                        console.log("  - updateFolderBookmarks completed successfully.");
                        performSwitch(targetFolderId, sendResponse, currentFolderId); // Pass currentFolderId as previous
                    })
                    .catch(error => {
                        console.error("  - Error in updateFolderBookmarks:", error);
                        sendResponse({ success: false, error: "Error updating folder bookmarks." });
                    });


            }).catch(error => {
                console.error("  - Error fetching bookmarks before update:", error);
                console.error("  - Attempting to save current bookmark bar to a new folder due to fetch error...");

                // --- NEW: Save current bookmark bar to a new folder in case of error ---
                saveBookmarkBarToNewFolder()
                    .then(newFolderName => {
                        console.log(`  - Bookmark bar saved to new folder: "${newFolderName}"`);
                        sendResponse({ success: false, error: `Error fetching bookmarks for update. Current Bookmark Bar saved to new folder: "${newFolderName}"` }); // Inform popup
                    })
                    .catch(saveError => {
                        console.error("  - Failed to save bookmark bar:", saveError);
                        sendResponse({ success: false, error: "Error fetching bookmarks for update AND failed to save current bookmark bar!" }); // Inform popup about save failure
                    });
            });
        }); // End of chrome.bookmarks.get(currentFolderId, ...)
    });
}


function performSwitch(targetFolderId, sendResponse, previousFolderId) {
    console.log("performSwitch function started, targetFolderId:", targetFolderId, "previousFolderId:", previousFolderId);
    // --- Clear Bookmarks Bar ---
    clearBookmarksBar()
        .then(() => {
            console.log("  - clearBookmarksBar completed.");
            // --- Copy Bookmarks from Target Folder to Bookmark Bar ---
            return copyBookmarksToBar(targetFolderId);
        })
        .then(() => {
            console.log("  - copyBookmarksToBar completed.");
            // --- Update selectedFolderId in storage ---
            return setSelectedFolderId(targetFolderId);
        })
        .then(() => {
            console.log("  - setSelectedFolderId completed, new selectedFolderId:", targetFolderId);
            console.log("Bookmarks switched successfully to folder ID:", targetFolderId);
            sendResponse({ success: true });
        })
        .catch(error => {
            console.error("Error during bookmark switch in performSwitch:", error);
            sendResponse({ success: false, error: "Error during bookmark switch." });
        });
}


function clearBookmarksBar() {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.getChildren('1', children => { // '1' is ID of Bookmark Bar
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            console.log("clearBookmarksBar - Children of Bookmark Bar:", children);
            let removalPromises = children.map(child => {
                return new Promise(resolveRemove => {
                    chrome.bookmarks.removeTree(child.id, () => {
                        resolveRemove();
                    });
                });
            });
            Promise.all(removalPromises).then(resolve).catch(reject);
        });
    });
}

function copyBookmarksToBar(folderId) {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.getChildren(folderId, bookmarks => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            console.log("copyBookmarksToBar - Bookmarks from folderId:", folderId, "are:", bookmarks);
            let createPromises = bookmarks.map(bookmark => {
                return new Promise(resolveCreate => {
                    createBookmarkOnBar(bookmark, resolveCreate);
                });
            });
            Promise.all(createPromises).then(resolve).catch(reject);
        });
    });
}

function createBookmarkOnBar(bookmark, resolve) {
    let bookmarkProperties = {
        parentId: '1', // '1' is Bookmark Bar
        title: bookmark.title,
    };
    if (bookmark.url) {
        bookmarkProperties.url = bookmark.url;
    }

    chrome.bookmarks.create(bookmarkProperties, createdBookmark => {
        resolve(createdBookmark);
    });
}


function getBookmarksInFolder(folderId) {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.getChildren(folderId, bookmarks => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            console.log("getBookmarksInFolder - Bookmarks from folderId:", folderId, "are:", bookmarks);
            resolve(bookmarks);
        });
    });
}

function setSelectedFolderId(folderId) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ 'selectedFolderId': folderId }, resolve);
    });
}


function updateFolderBookmarks(folderId, bookmarkBarBookmarks, currentFolderBookmarks) {
    return new Promise(async (resolve, reject) => {
        console.log("updateFolderBookmarks called for folderId:", folderId);
        console.log("  - Bookmark Bar Bookmarks:", bookmarkBarBookmarks);
        console.log("  - Current Folder Bookmarks (before update):", currentFolderBookmarks);

        // Basic Implementation:  For now, let's just clear the folder and re-add bookmarks from bookmark bar
        try {
            await clearFolder(folderId); // Clear existing bookmarks in the folder
            console.log("  - Folder cleared:", folderId);
            await copyBookmarksToFolder(folderId, bookmarkBarBookmarks); // Copy current bookmark bar bookmarks
            console.log("  - Bookmarks copied to folder:", folderId);
            resolve();
        } catch (error) {
            console.error("Error during updateFolderBookmarks:", error);
            reject(error);
        }
    });
}


function clearFolder(folderId) {
    return new Promise((resolve, reject) => {
        chrome.bookmarks.getChildren(folderId, children => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            console.log("clearFolder - Children of folderId:", folderId, "are:", children);
            if (!children || children.length === 0) {
                console.log("  - Folder is already empty.");
                resolve(); // Folder is already empty
                return;
            }
            let removalPromises = children.map(child => {
                return new Promise(resolveRemove => {
                    chrome.bookmarks.removeTree(child.id, () => {
                        resolveRemove();
                    });
                });
            });
            Promise.all(removalPromises).then(resolve).catch(reject);
        });
    });
}


function copyBookmarksToFolder(folderId, bookmarksToCopy) {
    return new Promise(async (resolve, reject) => {
        console.log("copyBookmarksToFolder called for folderId:", folderId);
        console.log("  - Bookmarks to copy:", bookmarksToCopy);
        if (!bookmarksToCopy || bookmarksToCopy.length === 0) {
            console.log("  - No bookmarks to copy.");
            resolve(); // Nothing to copy
            return;
        }

        try {
            for (const bookmark of bookmarksToCopy) {
                await createBookmarkInFolder(folderId, bookmark); // Use await to process bookmarks sequentially
            }
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}


function createBookmarkInFolder(folderId, bookmark) {
    return new Promise((resolve, reject) => {
        let bookmarkProperties = {
            parentId: folderId,
            title: bookmark.title,
        };
        if (bookmark.url) {
            bookmarkProperties.url = bookmark.url;
        }

        chrome.bookmarks.create(bookmarkProperties, createdBookmark => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(createdBookmark);
            }
        });
    });
}


// --- NEW FUNCTION: Save Bookmark Bar to New Folder ---
function saveBookmarkBarToNewFolder() {
    return new Promise((resolve, reject) => {
        getBookmarksInFolder('1') // Get bookmarks from Bookmark Bar
            .then(bookmarkBarBookmarks => {
                if (bookmarkBarBookmarks && bookmarkBarBookmarks.length > 0) { // Only save if bookmark bar is not empty
                    const folderName = `Saved Bookmark Bar - ${new Date().toLocaleString()}`;
                    chrome.bookmarks.create({ // Create a new folder
                        parentId: '2', // '2' is "Other Bookmarks" - you can change this
                        title: folderName,
                        type: 'folder'
                    }, newFolder => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                            return;
                        }
                        copyBookmarksToFolder(newFolder.id, bookmarkBarBookmarks) // Copy bookmarks to the new folder
                            .then(() => {
                                resolve(folderName); // Resolve with the new folder name
                            })
                            .catch(copyError => {
                                reject(copyError);
                            });
                    });
                } else {
                    resolve("Bookmark Bar was empty, not saved."); // Resolve even if bookmark bar is empty, no save needed
                }
            })
            .catch(error => {
                reject(error);
            });
    });
}