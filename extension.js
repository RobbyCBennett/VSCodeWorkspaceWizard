'use strict';


const vscode = require('vscode');


//
// Constants
//

const ICON_NEW_WINDOW_OBJ     = new vscode.ThemeIcon('empty-window');
const ICON_CURRENT_WINDOW_OBJ = new vscode.ThemeIcon('window');

const ICON_DEFAULT_FOLDER_OBJ    = new vscode.ThemeIcon('folder');
const ICON_DEFAULT_WORKSPACE_OBJ = new vscode.ThemeIcon('folder-library');

const QUICK_PICK_ITEM_ACTION_FOLDER    = false;
const QUICK_PICK_ITEM_ACTION_WORKSPACE = true;

const QUICK_SELECT_BUTTON_ACTION_NEW_FOLDER    = false;
const QUICK_SELECT_BUTTON_ACTION_NEW_WORKSPACE = true;

const RE_WORKSPACE = /\.code-workspace$/;


//
// Temporary Data
//


let context;

let iconQuickPickFolderObj;
let iconQuickPickWorkspaceObj;
let iconSidebarFolderObj;
let iconSidebarWorkspaceObj;

let quickPick;
let treeDataProvider;
let watcher;


//
// Tree Data Provider
//


class WorkspaceTreeDataProvider
{
	_onDidChangeTreeData;
	onDidChangeTreeData;

	constructor()
	{
		this._onDidChangeTreeData = new vscode.EventEmitter();
		this.onDidChangeTreeData = this._onDidChangeTreeData.event;
	}

	async getChildren(treeItem)
	{
		return new Promise(async (resolve, reject) =>
		{
			// Get path
			let uri;
			// Get path of the workspaces folder
			if (!treeItem) {
				const workspacesFolder = vscode.workspace.getConfiguration().get('workspaceWizard.general.workspacesFolder');
				if (!workspacesFolder) {
					popupInfoSelectWorkspacesFolder();
					return resolve([]);
				}
				uri = vscode.Uri.file(workspacesFolder);

				createSidebarConfigurableIcons();
			}
			// Get path of a sub-folder
			else
				uri = treeItem.uri;

			// Create tree items for files
			const treeItems = [];
			for (const [name, fileType] of await readDirectory(uri)) {
				// File
				if (fileType & vscode.FileType.File) {
					if (RE_WORKSPACE.test(name))
						treeItems.push(new WorkspaceFileTreeItem(uri, name));
				}
				// Folder
				else {
					treeItems.push(new FolderTreeItem(uri, name));
				}
			}

			return resolve(treeItems);
		});
	}

	getTreeItem(treeItem)
	{
		return treeItem;
	}

	refresh()
	{
		this._onDidChangeTreeData.fire();
	}
}


class FolderTreeItem extends vscode.TreeItem
{
	constructor(uri, name)
	{
		uri = vscode.Uri.joinPath(uri, name);

		// Collapsed
		const collapsibleState = vscode.workspace.getConfiguration().get('workspaceWizard.sidebar.expandFolders')
			? vscode.TreeItemCollapsibleState.Expanded
			: vscode.TreeItemCollapsibleState.Collapsed;

		// TreeItem
		super(
			name,
			collapsibleState,
		);
		this.contextValue = 'folder';
		this.iconPath = iconSidebarFolderObj;

		// Custom
		this.uri = uri;
	}
}


class WorkspaceFileTreeItem extends vscode.TreeItem
{
	constructor(uri, name)
	{
		uri = vscode.Uri.joinPath(uri, name);

		// TreeItem
		super(
			simplifyWorkspace(name),
			vscode.TreeItemCollapsibleState.None
		);
		this.command = {
			arguments: [{
				uri: uri,
				isWorkspaceFileTreeItem: true,
			}],
			command: 'workspaceWizard._openWorkspace',
			title: 'Open workspace title',
			tooltip: 'Open workspace tooltip',
		};
		this.contextValue = 'workspace';
		this.iconPath = iconSidebarWorkspaceObj;

		// Custom
		this.uri = uri;
	}
}


//
// Quick Pick Items
//


class OpenQuickInputButton
{
	constructor()
	{
		if (vscode.workspace.getConfiguration().get('workspaceWizard.quickPick.openInNewWindow')) {
			this.iconPath = ICON_CURRENT_WINDOW_OBJ;
			this.tooltip = 'Open Workspace in Current Window';
		}
		else {
			this.iconPath = ICON_NEW_WINDOW_OBJ;
			this.tooltip = 'Open Workspace in New Window';
		}
	}
}


class FolderQuickPickItem
{
	constructor(uri, name, icon)
	{
		// QuickPickItem
		this.label = `${iconIdToIconInLabel(icon)}${name}`;
		this.description = 'Folder';

		// Custom
		this.action = QUICK_PICK_ITEM_ACTION_FOLDER;
		this.uri = vscode.Uri.joinPath(uri, name);
	}
}


class WorkspaceFileQuickPickItem
{
	constructor(uri, name, icon)
	{
		// QuickPickItem
		this.label = `${iconIdToIconInLabel(icon)}${simplifyWorkspace(name)}`;
		this.description = 'Workspace';
		this.buttons = [new OpenQuickInputButton()];

		// Custom
		this.action = QUICK_PICK_ITEM_ACTION_WORKSPACE;
		this.uri = vscode.Uri.joinPath(uri, name);
	}
}


class NewFolderQuickInputButton
{
	constructor(uri)
	{
		// QuickInputButton
		this.tooltip = 'New Folder';
		this.iconPath = iconQuickPickFolderObj;

		// Custom
		this.action = QUICK_SELECT_BUTTON_ACTION_NEW_FOLDER;
		this.uri = uri;
	}
}


class NewWorkspaceFileQuickInputButton
{
	constructor(uri)
	{
		// QuickInputButton
		this.tooltip = 'New Workspace';
		this.iconPath = iconQuickPickWorkspaceObj;

		// Custom
		this.action = QUICK_SELECT_BUTTON_ACTION_NEW_WORKSPACE;
		this.uri = uri;
	}
}


//
// Helper Functions
//


async function readDirectory(uri)
{
	const sortOrder = vscode.workspace.getConfiguration().get('workspaceWizard.general.sortOrder');
	const foldersFirst = sortOrder === 'Folders First';
	const workspacesFirst = sortOrder === 'Workspaces First';

	let files;
	try {
		files = await vscode.workspace.fs.readDirectory(uri);
	} catch (error) {
		popupErrorUnableToOpen(uri);
		return [];
	}

	files.sort(function(a, b) {
		if (foldersFirst) {
			if (a[1] === vscode.FileType.File && b[1] === vscode.FileType.Directory)
				return 1;
			else if (a[1] === vscode.FileType.Directory && b[1] === vscode.FileType.File)
				return -1;
		}
		else if (workspacesFirst) {
			if (a[1] === vscode.FileType.Directory && b[1] === vscode.FileType.File)
				return 1;
			else if (a[1] === vscode.FileType.File && b[1] === vscode.FileType.Directory)
				return -1;
		}
		if (a[0] > b[0])
			return 1;
		else if (a[0] < b[0])
			return -1;
		else
			return 0;
	});

	return files;
}


function toRealPath(possiblePath)
{
	if (typeof possiblePath !== 'string')
		return null;
	return vscode.Uri.file(possiblePath).fsPath;
}


function iconIdToIconInLabel(string)
{
	return string ? `$(${string}) ` : string;
}


function createQuickPickConfigurableIcons()
{
	const config = vscode.workspace.getConfiguration();

	let icon = config.get('workspaceWizard.quickPick.icon.folder');
	iconQuickPickFolderObj = icon ? new vscode.ThemeIcon(icon) : ICON_DEFAULT_FOLDER_OBJ;

	icon = config.get('workspaceWizard.quickPick.icon.workspace');
	iconQuickPickWorkspaceObj = icon ? new vscode.ThemeIcon(icon) : ICON_DEFAULT_WORKSPACE_OBJ;
}


function createSidebarConfigurableIcons()
{
	const config = vscode.workspace.getConfiguration();

	let icon = config.get('workspaceWizard.sidebar.icon.folder');
	iconSidebarFolderObj = icon ? new vscode.ThemeIcon(icon) : undefined;

	icon = config.get('workspaceWizard.sidebar.icon.workspace');
	iconSidebarWorkspaceObj = icon ? new vscode.ThemeIcon(icon) : undefined;
}


function configChanged(e) {
	if (e.affectsConfiguration('workspaceWizard.sidebar.watchForChanges'))
		startOrStopFileSystemWatcher();
	else if (e.affectsConfiguration('workspaceWizard.general.sortOrder'))
		refreshWorkspacesSidebar();
}


function popupErrorUnableToOpen(uri)
{
	const buttonText = 'Configure';
	vscode.window.showErrorMessage(`Unable to open ${uri.fsPath}`, buttonText).then(function(selection) {
		if (selection === buttonText)
			selectWorkspacesFolder();
	});
}


function popupInfoSelectWorkspacesFolder()
{
	const buttonText = 'Configure';
	vscode.window.showInformationMessage('Select workspaces folder', buttonText).then(function(selection) {
		if (selection === buttonText)
			selectWorkspacesFolder();
	});
}


function simplifyWorkspace(name)
{
	return name.slice(0, -15);
}


function startOrStopFileSystemWatcher()
{
	const config = vscode.workspace.getConfiguration();

	// If the user wants to watch for changes
	if (config.get('workspaceWizard.sidebar.watchForChanges')) {
		// Skip if it's already been started
		if (watcher !== undefined)
			return;

		// Skip if there is no workspace folder
		const workspacesFolder = config.get('workspaceWizard.general.workspacesFolders');
		if (!workspacesFolder)
			return;

		// Start watching
		const uri = vscode.Uri.file(workspacesFolder);
		const globPattern = new vscode.RelativePattern(uri, '**/*');
		const ignoreCreate = false;
		const ignoreChange = true;
		const ignoreDelete = false;
		watcher = vscode.workspace.createFileSystemWatcher(
			globPattern, ignoreCreate, ignoreChange, ignoreDelete);
		watcher.onDidCreate(refreshWorkspacesSidebar);
		watcher.onDidDelete(refreshWorkspacesSidebar);
	}
	// If the user wants to watch for changes
	else {
		// Skip if it's already been stopped
		if (watcher === undefined)
			return;

		// Stop watching
		watcher.dispose();
		watcher = undefined;
	}
}


//
// Extension Commands Not in Command Palette
//


function openWorkspaceInCurrentWindow(item)
{
	vscode.commands.executeCommand('vscode.openFolder', item.uri, {forceNewWindow: false});
}


function openWorkspaceInNewWindow(item)
{
	vscode.commands.executeCommand('vscode.openFolder', item.uri, {forceNewWindow: true});
}


//
// Extension Commands in Command Palette
//


function editWorkspacesFolder()
{
	const workspacesFolder = vscode.workspace.getConfiguration().get('workspaceWizard.general.workspacesFolder');
	if (!workspacesFolder)
		return popupInfoSelectWorkspacesFolder();

	const uri = vscode.Uri.file(workspacesFolder);
	vscode.commands.executeCommand('vscode.openFolder', uri);
}


function selectWorkspacesFolder()
{
	vscode.commands.executeCommand('workbench.action.openSettings', 'workspaceWizard.general.workspacesFolder');
}


function openWorkspace(item)
{
	// Decide between new window and current window
	let openInNewWindow;
	if (item.isWorkspaceFileTreeItem === true)
		openInNewWindow = vscode.workspace.getConfiguration().get('workspaceWizard.sidebar.openInNewWindow');
	else if (item)
		openInNewWindow = vscode.workspace.getConfiguration().get('workspaceWizard.quickPick.openInNewWindow');

	// Open
	if (openInNewWindow)
		openWorkspaceInNewWindow(item);
	else
		openWorkspaceInCurrentWindow(item);
}


async function newFolder(uri)
{
	// Make example URI
	const name = 'NEW_FOLDER';
	uri = vscode.Uri.joinPath(uri, name);

	// Get select range
	const selectStart = uri.fsPath.length - name.length;
	const selectEnd = uri.fsPath.length;

	// Get URI by user input
	const path = await vscode.window.showInputBox({
		placeHolder: uri.fsPath,
		prompt: 'New folder to group workspaces',
		title: 'New Folder',
		value: uri.fsPath,
		valueSelection: [selectStart, selectEnd],
	});
	uri = vscode.Uri.file(path);

	// Create the folder
	await vscode.workspace.fs.createDirectory(uri);
}


async function newWorkspace(uri)
{
	// Make sure workspaceFolders isn't undefined
	const workspaceFolders = vscode.workspace.workspaceFolders || [];

	// Make example URI
	const name = (workspaceFolders.length) ? workspaceFolders[0].name : 'workspace';
	const ext = '.code-workspace';
	uri = vscode.Uri.joinPath(uri, `${name}${ext}`);

	// Get select range
	const selectStart = uri.fsPath.length - ext.length - name.length;
	const selectEnd = uri.fsPath.length - ext.length;

	// Get URI by user input
	const path = await vscode.window.showInputBox({
		placeHolder: uri.fsPath,
		prompt: 'New workspace',
		title: 'New Workspace',
		value: uri.fsPath,
		valueSelection: [selectStart, selectEnd],
	});
	uri = vscode.Uri.file(path);

	// Create the content of the workspace file
	const workspace = { folders: [] };
	for (const workspaceFolder of workspaceFolders)
		workspace.folders.push({ path: workspaceFolder.uri.fsPath });

	// Create the workspace file
	const workspaceEdit = new vscode.WorkspaceEdit();
	workspaceEdit.createFile(uri, {
		contents: Buffer.from(JSON.stringify(workspace, null, '\t')),
	});
	const created = await vscode.workspace.applyEdit(workspaceEdit);

	// Open the newly created workspace
	vscode.commands.executeCommand('vscode.openFolder', uri, {forceNewWindow: false});
}


async function quickPickWorkspace(uri, startup)
{
	// Stop if already searching filesystem to avoid duplication
	if (quickPick && quickPick.busy)
		return;

	// Get path of the workspaces folder
	const workspacesFolder = toRealPath(vscode.workspace.getConfiguration().get('workspaceWizard.general.workspacesFolder'));

	// If there is no current workspace/folder
	if (!uri) {
		// Stop if starting up and editing an existing file
		if (startup && vscode.window.activeTextEditor && !vscode.window.activeTextEditor.document.isUntitled)
			return;
		// Stop if there is no workspaces folder
		if (!workspacesFolder)
			return popupInfoSelectWorkspacesFolder();
		// Initialize the first uri
		uri = vscode.Uri.file(workspacesFolder);
	}

	// Initialize quick pick
	if (!quickPick) {
		quickPick = vscode.window.createQuickPick();
		quickPick.title = 'Workspaces';
		quickPick.buttons = [];
		quickPick.onDidChangeSelection(function(quickPickItems) {
			if (quickPickItems.length === 0)
				return;
			const quickPickItem = quickPickItems[0];
			switch (quickPickItem.action) {
				case QUICK_PICK_ITEM_ACTION_FOLDER:
					quickPickWorkspace(quickPickItem.uri, false);
					break;
				case QUICK_PICK_ITEM_ACTION_WORKSPACE:
					openWorkspace(quickPickItem);
					break;
			}
		});
		quickPick.onDidHide(function() {
			quickPick.dispose();
			quickPick = undefined;
		});
		quickPick.onDidTriggerItemButton(function(e) {
			if (vscode.workspace.getConfiguration().get('workspaceWizard.quickPick.openInNewWindow'))
				openWorkspaceInCurrentWindow(e.item);
			else
				openWorkspaceInNewWindow(e.item);
		});
		quickPick.onDidTriggerButton(async function(button) {
			switch (button.action) {
				case QUICK_SELECT_BUTTON_ACTION_NEW_FOLDER:
					await newFolder(button.uri);
					quickPickWorkspace(button.uri, false);
					break;
				case QUICK_SELECT_BUTTON_ACTION_NEW_WORKSPACE:
					newWorkspace(button.uri);
					break;
				case undefined: // Back
					quickPickWorkspace(quickPick.items[0].uri, false);
					break;
			}
		});
	}

	// Clear the filter text value and the folder/workspace items
	quickPick.value = '';
	quickPick.items = [];

	// Get the icons
	const folderIcon = vscode.workspace.getConfiguration().get('workspaceWizard.quickPick.icon.folder');
	const workspaceIcon = vscode.workspace.getConfiguration().get('workspaceWizard.quickPick.icon.workspace')
	createQuickPickConfigurableIcons();

	// Add new folder and new workspace buttons
	quickPick.buttons = [
		new NewFolderQuickInputButton(uri),
		new NewWorkspaceFileQuickInputButton(uri),
	];

	// If in a sub-folder, add back button and .. button
	if (uri.fsPath !== workspacesFolder) {
		quickPick.buttons.push(vscode.QuickInputButtons.Back);
		quickPick.buttons = quickPick.buttons;
		quickPick.items.push(new FolderQuickPickItem(uri, '..', folderIcon));
	}

	// Show as empty with the loading indicator
	quickPick.busy = true;
	quickPick.show();

	// Add other children of the folder as quick pick items
	for (const [name, fileType] of await readDirectory(uri)) {
		// File
		if (fileType & vscode.FileType.File) {
			if (RE_WORKSPACE.test(name))
				quickPick.items.push(new WorkspaceFileQuickPickItem(uri, name, workspaceIcon));
		}
		// Folder
		else {
			quickPick.items.push(new FolderQuickPickItem(uri, name, folderIcon));
		}
	}

	// Show the items and remove the loading indicator
	quickPick.items = quickPick.items;
	quickPick.busy = false;
}


function refreshWorkspacesSidebar()
{
	treeDataProvider.refresh();
}


//
// Extension Initialization
//


function activate(_context)
{
	// Temporary data
	context = _context;
	treeDataProvider = new WorkspaceTreeDataProvider();

	// Register
	context.subscriptions.push(
		// Tree data provider
		vscode.window.registerTreeDataProvider('workspaceWizard', treeDataProvider),

		// Commands
		vscode.commands.registerCommand('workspaceWizard.editWorkspacesFolder', editWorkspacesFolder),
		vscode.commands.registerCommand('workspaceWizard.openWorkspace', openWorkspace),
		vscode.commands.registerCommand('workspaceWizard.openWorkspaceInCurrentWindow', openWorkspaceInCurrentWindow),
		vscode.commands.registerCommand('workspaceWizard.openWorkspaceInNewWindow', openWorkspaceInNewWindow),
		vscode.commands.registerCommand('workspaceWizard.quickPickWorkspace', quickPickWorkspace),
		vscode.commands.registerCommand('workspaceWizard.refreshWorkspacesSidebar', refreshWorkspacesSidebar),
		vscode.commands.registerCommand('workspaceWizard.selectWorkspacesFolder', selectWorkspacesFolder),
	);

	// Tree view
	vscode.window.createTreeView(
		'workspaceWizard',
		{ treeDataProvider: treeDataProvider }
	);

	// Open the workspaces on startup
	const isExisting = vscode.workspace.name ? true : false;
	const startAction = isExisting
		? vscode.workspace.getConfiguration().get('workspaceWizard.general.startOnExistingWindow')
		: vscode.workspace.getConfiguration().get('workspaceWizard.general.startOnNewWindow');
	if (startAction === 'QuickPick')
		quickPickWorkspace(null, true);
	else if (startAction === 'Sidebar')
		vscode.commands.executeCommand('workbench.view.extension.workspaceWizard');

	// Watch file system for changes to the workspaces folder
	startOrStopFileSystemWatcher();
	vscode.workspace.onDidChangeConfiguration(configChanged);
}


function deactivate()
{}


module.exports = {
	activate,
	deactivate
}
