// All string constants in one location — no literals elsewhere

// File extensions
export const NAP_EXTENSION = ".nap";
export const NAPLIST_EXTENSION = ".naplist";
export const NAPENV_EXTENSION = ".napenv";
export const NAPENV_LOCAL_SUFFIX = ".local";
export const FSX_EXTENSION = ".fsx";
export const CSX_EXTENSION = ".csx";

// Glob patterns
export const NAP_GLOB = "**/*.nap";
export const NAPLIST_GLOB = "**/*.naplist";
export const NAPENV_GLOB = "**/.napenv*";

// View IDs
export const VIEW_EXPLORER = "napperExplorer";

// Command IDs
export const CMD_RUN_FILE = "napper.runFile";
export const CMD_RUN_ALL = "napper.runAll";
export const CMD_NEW_REQUEST = "napper.newRequest";
export const CMD_NEW_PLAYLIST = "napper.newPlaylist";
export const CMD_SWITCH_ENV = "napper.switchEnvironment";
export const CMD_COPY_CURL = "napper.copyAsCurl";
export const CMD_OPEN_RESPONSE = "napper.openResponse";
export const CMD_SAVE_REPORT = "napper.savePlaylistReport";

// Config keys
export const CONFIG_SECTION = "napper";
export const CONFIG_DEFAULT_ENV = "defaultEnvironment";
export const CONFIG_AUTO_RUN = "autoRunOnSave";
export const CONFIG_SPLIT_LAYOUT = "splitEditorLayout";
export const CONFIG_MASK_SECRETS = "maskSecretsInPreview";
export const CONFIG_CLI_PATH = "cliPath";

// CLI defaults
export const DEFAULT_CLI_PATH = "napper";
export const CLI_OUTPUT_JSON = "json";
export const CLI_OUTPUT_NDJSON = "ndjson";
export const CLI_CMD_RUN = "run";
export const CLI_CMD_CHECK = "check";
export const CLI_FLAG_OUTPUT = "--output";
export const CLI_FLAG_ENV = "--env";
export const CLI_FLAG_VAR = "--var";

// Context values for tree items
export const CONTEXT_REQUEST_FILE = "requestFile";
export const CONTEXT_PLAYLIST = "playlist";
export const CONTEXT_FOLDER = "folder";
export const CONTEXT_PLAYLIST_SECTION = "playlistSection";

// Labels
export const PLAYLIST_SECTION_LABEL = "Playlists";

// Icons
export const ICON_PLAYLIST_SECTION = "list-tree";
export const ICON_PLAYLIST_FILE = "list-ordered";
export const ICON_IDLE = "circle-outline";
export const ICON_RUNNING = "loading~spin";
export const ICON_PASSED = "pass";
export const ICON_FAILED = "error";
export const ICON_ERROR = "warning";
export const ICON_IMPORT_OPENAPI = "cloud-download";

// Section headers in .nap files
export const SECTION_REQUEST = "[request]";
export const SECTION_META = "[meta]";
export const SECTION_STEPS = "[steps]";

// Status bar
export const STATUS_BAR_PREFIX = "Napper: ";
export const STATUS_BAR_NO_ENV = "No Environment";
export const STATUS_BAR_PRIORITY = 100;

// Theme colors for run state icons
export const THEME_COLOR_PASSED = "testing.iconPassed";
export const THEME_COLOR_FAILED = "testing.iconFailed";
export const THEME_COLOR_ERROR = "problemsWarningIcon.foreground";

// Response panel
export const RESPONSE_PANEL_TITLE = "Napper Response";
export const RESPONSE_PANEL_VIEW_TYPE = "napperResponse";

// Playlist panel
export const PLAYLIST_PANEL_TITLE = "Napper Playlist";
export const PLAYLIST_PANEL_VIEW_TYPE = "napperPlaylist";

// Webview message types
export const MSG_ADD_RESULT = "addResult";
export const MSG_RUN_COMPLETE = "runComplete";
export const MSG_RUN_ERROR = "runError";
export const MSG_SAVE_REPORT = "saveReport";

// Report
export const REPORT_FILE_EXTENSION = ".html";
export const REPORT_FILE_SUFFIX = "-report";
export const REPORT_SAVED_MSG = "Report saved: ";

// CLI error messages
export const CLI_SPAWN_FAILED_PREFIX = "Failed to run CLI: ";
export const CLI_PARSE_FAILED_PREFIX = "Failed to parse CLI JSON: ";
export const CLI_ERROR_PREFIX = "Napper CLI error: ";

// Status bar running
export const STATUS_RUNNING_ICON = "$(loading~spin) Running ";
export const STATUS_RUNNING_SUFFIX = "...";

// Curl
export const CURL_CMD_PREFIX = "curl -X ";

// File creation
export const REQUEST_NAME_SUFFIX = "-request";

// Nap file content formatting
export const NAP_NAME_KEY_PREFIX = "name = \"";
export const NAP_NAME_KEY_SUFFIX = "\"";

// Property keys
export const PROP_FILE_PATH = "filePath";

// CLI installer
export const CLI_REPO_OWNER = "MelbourneDeveloper";
export const CLI_REPO_NAME = "napper";
export const CLI_BINARY_NAME = "napper";
export const CLI_BIN_DIR = "bin";
export const CLI_DOWNLOAD_HOST = "github.com";
export const CLI_DOWNLOAD_PATH_PREFIX = "/MelbourneDeveloper/napper/releases/latest/download/";
export const CLI_ASSET_PREFIX = "napper-";
export const CLI_WIN_EXE_SUFFIX = ".exe";
export const CLI_MAX_REDIRECTS = 5;
export const CLI_PLATFORM_DARWIN = "darwin";
export const CLI_PLATFORM_LINUX = "linux";
export const CLI_PLATFORM_WIN32 = "win32";
export const CLI_ARCH_ARM64 = "arm64";
export const CLI_ARCH_X64 = "x64";
export const CLI_RID_OSX_ARM64 = "osx-arm64";
export const CLI_RID_OSX_X64 = "osx-x64";
export const CLI_RID_LINUX_X64 = "linux-x64";
export const CLI_RID_WIN_X64 = "win-x64";
export const CLI_INSTALL_MSG = "Installing Napper CLI...";
export const CLI_INSTALL_COMPLETE_MSG = "Napper CLI installed successfully";
export const CLI_INSTALL_FAILED_MSG = "Failed to install Napper CLI: ";
export const CLI_UNSUPPORTED_PLATFORM_MSG = "Unsupported platform: ";
export const CLI_DOWNLOAD_ERROR_PREFIX = "Download failed: HTTP ";
export const CLI_REDIRECT_ERROR = "Redirect with no location header";
export const CLI_TOO_MANY_REDIRECTS = "Too many redirects";
export const CLI_FILE_MODE_EXECUTABLE = 0o755;

// VSCode built-in commands
export const CMD_VSCODE_OPEN = "vscode.open";

// Layout options
export const LAYOUT_BESIDE = "beside";
export const LAYOUT_BELOW = "below";

// Encoding
export const ENCODING_UTF8 = "utf-8";

// Language IDs
export const LANG_NAP = "nap";
export const LANG_NAPLIST = "naplist";

// UI messages
export const MSG_NO_FILE_SELECTED = "No .nap or .naplist file selected";
export const MSG_COPIED = "Copied to clipboard";
export const MSG_NO_RESPONSE = "No response to show. Run a request first.";

// UI prompts
export const PROMPT_SELECT_METHOD = "Select HTTP method";
export const PROMPT_ENTER_URL = "Enter request URL";
export const PROMPT_REQUEST_NAME = "Request file name";
export const PROMPT_PLAYLIST_NAME = "Playlist name";
export const PROMPT_SELECT_ENV = "Select Napper environment";

// Default values
export const PLACEHOLDER_URL = "https://api.example.com/resource";
export const DEFAULT_PLAYLIST_NAME = "new-playlist";
export const DEFAULT_METHOD = "GET";

// .nap file keys
export const NAP_KEY_METHOD = "method";
export const NAP_KEY_URL = "url";

// HTTP methods
export const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

// Branding
export const NAPPER_URL = "https://napperapi.dev";
export const NIMBLESITE_URL = "https://nimblesite.co";
export const REPORT_FOOTER_GENERATED_BY = "Generated by";
export const REPORT_FOOTER_MADE_BY = "Made by";

// .nap file sections (additional)
export const SECTION_REQUEST_HEADERS = "[request.headers]";
export const SECTION_REQUEST_BODY = "[request.body]";
export const SECTION_ASSERT = "[assert]";
export const SECTION_VARS = "[vars]";

// .nap file content
export const NAP_TRIPLE_QUOTE = '"""';
export const HEADER_CONTENT_TYPE = "Content-Type";
export const HEADER_ACCEPT = "Accept";
export const CONTENT_TYPE_JSON = "application/json";
export const ASSERT_STATUS_PREFIX = "status = ";
export const ASSERT_BODY_EXISTS_SUFFIX = " exists";
export const ASSERT_BODY_PREFIX = "body.";
export const NAP_KEY_NAME = "name";
export const NAP_KEY_DESCRIPTION = "description";
export const NAP_KEY_GENERATED = "generated";
export const NAP_VALUE_TRUE = "true";
export const BASE_URL_VAR = "{{baseUrl}}";
export const BASE_URL_KEY = "baseUrl";
export const VARS_PLACEHOLDER = "REPLACE_ME";

// OpenAPI generator — command
export const CMD_IMPORT_OPENAPI = "napper.importOpenApi";
export const OPENAPI_CMD_TITLE = "Napper: Import from OpenAPI";
export const OPENAPI_PICK_FILE = "Select OpenAPI specification file";
export const OPENAPI_PICK_FOLDER = "Select output folder";
export const OPENAPI_SUCCESS_PREFIX = "Generated ";
export const OPENAPI_SUCCESS_SUFFIX = " test files from OpenAPI spec";
export const OPENAPI_ERROR_PREFIX = "Failed to import OpenAPI: ";
export const OPENAPI_FILTER_LABEL = "OpenAPI Spec";
export const OPENAPI_FILE_EXTENSIONS = ["json", "yaml", "yml"];

// OpenAPI generator — validation
export const OPENAPI_INVALID_SPEC = "Invalid OpenAPI specification: missing paths";
export const OPENAPI_NO_ENDPOINTS = "No endpoints found in specification";
export const OPENAPI_PARSE_ERROR = "Failed to parse JSON";

// OpenAPI generator — spec fields
export const HTTPS_SCHEME = "https";
export const DEFAULT_BASE_URL = "https://api.example.com";
export const OPENAPI_DEFAULT_TITLE = "API Tests";
export const PARAM_IN_BODY = "body";
export const PARAM_IN_QUERY = "query";
export const PARAM_IN_PATH = "path";
export const AUTH_BEARER_PREFIX = "Authorization = Bearer ";
export const AUTH_BASIC_PREFIX = "Authorization = Basic ";
export const SECURITY_TYPE_HTTP = "http";
export const SECURITY_SCHEME_BEARER = "bearer";
export const SECURITY_SCHEME_BASIC = "basic";
export const SECURITY_TYPE_API_KEY = "apiKey";
export const SECURITY_LOCATION_HEADER = "header";
export const SECURITY_LOCATION_QUERY = "query";

// OpenAPI generator — HTTP methods (lowercase for spec parsing)
export const OPENAPI_HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const;

// JSON Schema types
export const SCHEMA_TYPE_STRING = "string";
export const SCHEMA_TYPE_NUMBER = "number";
export const SCHEMA_TYPE_INTEGER = "integer";
export const SCHEMA_TYPE_BOOLEAN = "boolean";
export const SCHEMA_TYPE_ARRAY = "array";
export const SCHEMA_TYPE_OBJECT = "object";
export const SCHEMA_EXAMPLE_STRING = "example";

// Logging
export const LOG_CHANNEL_NAME = "Napper";
export const LOG_PREFIX_INFO = "INFO";
export const LOG_PREFIX_WARN = "WARN";
export const LOG_PREFIX_ERROR = "ERROR";
export const LOG_PREFIX_DEBUG = "DEBUG";
export const LOG_MSG_ACTIVATED = "Extension activated";
export const LOG_MSG_DEACTIVATED = "Extension deactivated";
export const LOG_MSG_RUN_FILE = "Running file:";
export const LOG_MSG_RUN_PLAYLIST = "Running playlist:";
export const LOG_MSG_CLI_RESULT_COUNT = "CLI returned results:";
export const LOG_MSG_CLI_SPAWN_ERROR = "CLI spawn error:";
export const LOG_MSG_STREAM_RESULT = "Stream result:";
export const LOG_MSG_STREAM_DONE = "Stream completed";
export const LOG_MSG_TREE_REFRESH = "Explorer tree refresh";
export const LOG_MSG_OPENAPI_IMPORT = "OpenAPI import:";

// Numeric thresholds
export const PERCENTAGE_MULTIPLIER = 100;
export const HTTP_STATUS_CLIENT_ERROR_MIN = 400;
