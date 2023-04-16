# Workspace Wizard

*Easily organize & switch workspaces*

# Setup

1. If you're unfamiliar workspaces, then read about them [here](https://code.visualstudio.com/docs/editor/workspaces), and create them with the command **_Workspaces: Save Workspace As_...** (find it using the [command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette))

2. If you don't have one already, create a folder and move any .code-workspace files into it. You may organize by creating any amount of sub-folders.

3. Run the command **_Workspace Wizard: Select Workspaces Folder_** and select it

# Features

* UI: Workspaces Sidebar
	* Shows up at the top of your left sidebar
	* Navigate with the arrow and spacebar keys or the mouse
	* Find a workspace and open it in the current window or a new window

* UI: Workspaces Quick Pick
	* Shows up at the top of your screen with a search filter
	* Navigate with the arrow and enter keys or the mouse
	* Find a workspace and open it in the current window or a new window

* Lots of Settings
	* Open your preferred UI for switching workspaces on startup
	* Add generic icons for all folders and all workspaces
	* Change the default open action: open in current window or new window
	* Automatically expand/collapse folders of the sidebar, or remember the expanded state
	* Watch the workspaces folder for changes, so the sidebar is always up-to-date

# Usage: Commands

In the [command palette](https://code.visualstudio.com/docs/getstarted/userinterface#_command-palette), type in "Workspace Wizard" to see all commands.

* **Workspace Wizard: Quick Pick Workspace**
	* Open the Workspaces quick pick

* **Workspace Wizard: Refresh Workspaces Sidebar**
	* Refresh the Workspaces tree sidebar
	* (Not necessary if you have enabled the setting **_Workspace Wizard >Sidebar >Watch for Changes_**)

* **Workspace Wizard: Select Workspaces Folder**
	* Select the folder that has your .code-workspace files

# Usage: Recommended Keybindings

```jsonc
// Open sidebar
{
	"key": "alt+shift+w",
	"command": "workbench.view.extension.workspaceWizard",
},
// Close sidebar
{
	"key": "escape",
	"when": "sideBarFocus && !treeFindOpen",
	"command": "workbench.action.closeSidebar",
},
// Open quick pick
{
	"key": "alt+shift+w",
	"command": "workspaceWizard.quickPickWorkspace",
},
```
