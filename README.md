# Bookmark Switcher Chrome Extension

## Description

This Chrome Extension allows you to easily switch between different sets of bookmarks on your browser's bookmark bar. Instead of having all your bookmarks cluttering the bar, you can organize them into folders and quickly swap them in and out as needed, keeping your bookmark bar clean and contextually relevant.

## Features

*   **Bookmark Folder Switching:**  Quickly switch the bookmarks displayed on your Bookmark Bar by selecting a folder from a dropdown menu in the extension popup.
*   **Favorites List:**  Add frequently used bookmark folders to a "Favorites" list for even faster access.
*   **Active Folder Indicator:**  Visually indicates the currently active bookmark folder in both the dropdown menu and the favorites list with a checkmark (✓).
*   **Save Bookmark Bar Changes:** Before switching to a new folder, any changes you've made to the current bookmark bar (adding, deleting, or modifying bookmarks) are automatically saved back to the previously active bookmark folder.
*   **Error Handling & Backup:**  Handles cases where bookmark fetching might fail and includes an edge case to save the current bookmark bar to a new folder if errors occur during bookmark updates.
*   **Handles Deleted Folders:** Gracefully manages scenarios where the currently active bookmark folder is deleted externally.
*   **Prevents Accidental Data Loss:** Prevents switching to the currently active folder to avoid accidental clearing of bookmarks.

## Installation

To install this extension in Chrome, follow these steps:

1.  **Download the extension files:**  Download the ZIP archive of this extension's code (if provided) or clone the repository if you have access to it.
2.  **Extract the files:** Unzip the downloaded archive to a folder on your computer.
3.  **Open Chrome Extensions Page:** In your Chrome browser, navigate to `chrome://extensions/` in the address bar.
4.  **Enable Developer Mode:**  In the top right corner of the Extensions page, toggle the "Developer mode" switch to the ON position.
5.  **Load Unpacked:** Click the "Load unpacked" button that appears in the top left corner.
6.  **Select Extension Folder:** In the file dialog that opens, navigate to the folder where you extracted the extension files and select that folder. Click "Select Folder" (or "Open" on some systems).

The Bookmark Switcher extension should now be installed and visible on your Chrome Extensions page and in your browser toolbar (typically as a puzzle piece icon).

## How to Use

1.  **Open the Extension Popup:** Click on the extension icon in your Chrome toolbar to open the popup.
2.  **Select a Bookmark Folder:**
    *   Use the dropdown menu labeled "Select Bookmark Folder:" to choose the bookmark folder you want to display on your Bookmark Bar.
    *   The dropdown list is populated with folders from your "Other Bookmarks" section (you can adjust this in the code if needed).
    *   The currently active bookmark folder (if any) is indicated with a checkmark (✓) in the dropdown.
3.  **Switch Bookmarks:** After selecting a folder, click the "Switch Bookmarks" button.
    *   The extension will first save any changes made to the *previously* active bookmark folder (if any).
    *   Then, it will clear your Bookmark Bar and load the bookmarks from the folder you selected onto the Bookmark Bar.
    *   The dropdown and favorites list will update to indicate the newly active folder with a checkmark.
4.  **Using Favorites:**
    *   **Add to Favorites:** To add the currently selected folder to your favorites list, click the star icon next to the dropdown. A filled star (★) indicates it's a favorite.
    *   **Remove from Favorites:** To remove a folder from favorites, click the filled star icon (it will revert to an outline star (☆) and remove the folder from the favorites list).
    *   **Switch to Favorite Folder:** Click on a folder name in the "Favorites" list to quickly switch your Bookmark Bar to that folder.
5.  **Managing Bookmarks:**  Once a bookmark folder is active (its bookmarks are on your Bookmark Bar), you can manage your bookmarks as usual:
    *   Add new bookmarks to the Bookmark Bar.
    *   Delete bookmarks from the Bookmark Bar.
    *   Edit existing bookmarks on the Bookmark Bar.
    *   **Important:** These changes will be saved back to the active bookmark folder when you switch to a different folder.

## Notes and Considerations

*   **Basic Synchronization:** This extension uses a basic method of synchronizing bookmark folders. When switching folders, it essentially overwrites the content of the *previous* active folder with the current state of the Bookmark Bar at the time of switching.  It does not implement more complex merging or change tracking.
*   **Potential Data Loss (Mitigated):** While the extension includes error handling and prevents switching to the same active folder to minimize data loss, it's always recommended to back up your bookmarks regularly, especially before using any bookmark management extension for the first time.
*   **Performance:** For very large bookmark folders, clearing and re-copying all bookmarks might have a slight performance impact, although this should be minimal for most users.
*   **Bookmark Folder Location:** The extension currently populates the dropdown with folders found within the "Other Bookmarks" section. You can adjust the code (`popup.js`, `populateFolderDropdown` function) to change the source of folders if needed.

## License

This extension is released under the [MIT License](LICENSE.txt).
# Bookmark-Switcher
