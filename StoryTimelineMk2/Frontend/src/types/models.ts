import type Konva from "konva";

export interface ChromeTheme {
    tbBgFrom: string
    tbBgTo: string
    tbBorderColor: string
    tbText: string
    tbSub: string
    tbBtnColor: string
    tbBtnHoverColor: string
    tbBtnHoverBg: string
    tbOrb1: string
    tbOrb2: string
    appBg: string
    appSurface: string
    appSurfaceRaised: string
    appSurfaceHigh: string
    appBorder: string
    appText: string
    appTextMuted: string
    appTextDim: string
    appAccent: string
    appAccentHover: string
    appSaveAccent: string
    appSaveAccentHover: string
    appToolActiveColor?: string
    appToolActiveBorder?: string
    filterPanelBg?: string
    filterPanelBorder?: string
    filterChipColor?: string
    filterChipBorder?: string
    appRadius: string
    appRadiusSm: string
    appRadiusLg: string
}

export interface TimelineProjectContainer {
    data: TimelineProject[]
}

export interface TimelineProject {
    Id: number;
    Title: string;
    Author: string;
    Description: string;
    StartYear: number;
    Color: string | null;
    CalendarId: string;
	Calendar: Calendar;
	Settings: TimelineSettings;
	LayoutSettings: LayoutSettings;
}

export interface TimelineSettings {
    PixelsPerSubtick: number;
    IsFullscreen: boolean;
    ShowGuides: boolean;
    WindowSizeX: number;
    WindowSizeY: number;
    WindowPositionX: number;
    WindowPositionY: number;
    UseCustomScaling: boolean;
    CustomScale: number;
    DisplayRadius: number;
    CanvasSettings: CanvasSettingsObject;
    TimelineMinimised: boolean;
    /** Title strip of the timeline window: 0 = full, 1 = compact (title only), 2 = hidden */
    HeaderMode: number;
    PanSpeedMultiplier: number;
    PanDeadzone: number;
    /** ← / → hold-to-pan speed in px/s (Shift = 3×) */
    KeyboardPanSpeed: number;
    DefaultItemColor: string;
}

export interface CanvasSettingsObject {
	showYearMarkers: boolean;
	fontFamily: string;
	fontSize: number;
	fontStyle: string;
	textColor: string;
	textOffsetX: number;
	textOffsetY: number;
	letterSpacing: number;
	defaultSplitterDistance: number;
}

export interface TimelineNote {
	Id: string;
    NoteContents: string;
    ConnectedItemId: string;
	TimelineId: number;
	NearestYear: number;
	AbsoluteTime: number;
	UpdatedAt: string;
}

export interface HiddenRange {
    Id: number;
    TimelineId: number;
    StartYear: number;
    EndYear: number;
    Label: string | null;
}

export interface ItemTagLink {
    ItemId: string;
    TagId: number;
    TagName: string;
}

export interface ItemCharacterLink {
    ItemId: string;
    CharacterId: string;
    CharacterName: string;
    CharacterColor: string | null;
}

export interface ItemStoryRefLink {
    ItemId: string;
    StoryId: string;
    StoryTitle: string;
}

export type FilterState = 'positive' | 'negative' | 'neutral';

export interface FilterRule {
    Id: string;
    TimelineId: number;
    Dimension: string;
    ParamsJson: string;
    Label: string;
    State: FilterState;
    SortOrder: number;
}

export interface FilterPreset {
    Id: string;
    Name: string;
    RulesJson: string;
    AndMode: number;
    CreatedAt?: string;
}

export interface FullTimelineProject {
    Project: TimelineProject;
    Items: TimelineItem[];
	Notes: TimelineNote[];
    HiddenRanges: HiddenRange[];
    ItemTags: ItemTagLink[];
    ItemCharacters: ItemCharacterLink[];
    Characters: CharacterItem[];
    ItemStoryRefs: ItemStoryRefLink[];
    ItemsWithPictures: string[];
}

export interface Calendar {
	Id: string;
	Name: string;
	ShortName: string;
	AlternateName: string;
	NameBefore0: string;
	NameAfter0: string;
	LodProfileId: string;
	YearDefinition: string;
	LodProfile: LodProfile;
}

export interface MonthDef {
	name: string;
	short_name?: string;
	length: number;
	season?: number;
}

export interface WeekDef {
	length: number;
	days_have_names?: boolean;
	days?: string[];
	days_have_short_names?: boolean;
	days_short?: string[];
	weekend?: number[];
}

export interface SeasonDef {
	name: string;
	short_name?: string;
	start: number;
	end: number;
	significance?: string;
}

export interface YearDefinition {
	length: number;
	months?: number;
	month_definition?: Record<string, any>;
	seasons?: number;
	season_definition?: Record<string, any>;
	week_definition?: WeekDef;
	year_start_dow?: number;  // day-of-week (0 = first weekday) that M1 D1 of year 0 falls on
}

export interface TimelineItem {
    Id: string; // UUID
	Title: string;
	Description: string;
	Content: string;
	StoryId: string | null;
	TypeId: number;
	Year: number;
	EndYear: number;
	AbsoluteStart: number;
	AbsoluteEnd: number;
	BookTitle: string;
	Chapter: string;
	Page: string;
	Color: string;
	CreationGranularity: number;
	TimelineId: number;
	ItemIndex: number;
	/** Side of the line: 0 = not assigned yet (backend picks on save), 1 = above, 2 = below. */
	Placement?: number;
	/** Box centered on its stem instead of offset to one side (events and notes) */
	Centered?: boolean;
	/** Draw the title as a caption strip on the canvas (pictures only) */
	ShowTitle?: boolean;
	/** Writer's private notes: stored and exported, never rendered anywhere */
	ItemNotes?: string | null;
	ShowInNotes: boolean;
	Importance: number;
	MinLodLevel: number;
	LodVisibilityMask: number;
}

export interface KonvaGroupObject {
	KonvaItem: Konva.Group;
	TimelineItem: TimelineItem;
}

export interface LodProfile {
	Id: string;
	Name: string;
	Profile: LodLevel[];
}

export interface LodLevel {
	index: number;
	formatKey: string;
	stepFraction: number;
}

export interface CharacterItem {
	Id: string;
	Name: string;
	Nicknames: string | null;
	Aliases: string | null;
	Race: string | null;
	Description: string | null;
	Color: string | null;
	Importance: number;
	TimelineId: number;
}

export interface Tag {
	Id: number;
	Name: string;
}

export interface Story {
	Id: string;
	Title: string;
	Description: string | null;
}

export interface Book {
	Id: string;
	Title: string;
	Author: string | null;
}

export interface Chapter {
	Id: string;
	BookId: string;
	Number: number;
	Title: string | null;
}

export interface ItemCharacterAppearance {
	CharacterId: string;
	CharacterName: string;
	CharacterColor: string | null;
	Role: string | null;
}

export interface ItemChapterRef {
	ChapterId: string;
	ChapterNumber: number;
	ChapterTitle: string | null;
	BookId: string;
	BookTitle: string;
}

export interface ItemStoryRef {
	StoryId: string;
	StoryTitle: string;
}

export interface MediaItem {
	Id: string;
	FilePath: string;
	/** 256px PNG under thumbs/ for small displays; falls back to FilePath when no thumb could be made */
	ThumbPath: string;
	FileName: string;
	FileSize: number;
	FileType: string;
	Width: number;
	Height: number;
	Title: string;
	Description: string;
	CreatedAt: string;
}

export interface ItemForEdit {
	Item: TimelineItem;
	Tags: Tag[];
	Characters: ItemCharacterAppearance[];
	StoryRefs: ItemStoryRef[];
	ChapterRefs: ItemChapterRef[];
	Calendar: Calendar;
	Pictures: MediaItem[];
}

// Reusable layoutSettings, can be attached to timeline
export interface LayoutSettings {
	Id: string;
	Name: string;
	// Event related things
	TimelineEventBoxWidth: number;
	TimelineEventBoxHeight: number;
	TimelineEventBoxStemOffset: number;
	TimelineEventBorderColor: string;
	TimelineEventBorderWidth: number;
	TimelineEventBorderRadius: number;
	TimelineEventPadding: string;
	TimelineEventYMargin: number;
	TimelineEventTextColor: string;
	TimelineEventBackgroundColor: string;
	TimelineEventFontFamily: string;
	TimelineEventFontSize: number;
	TimelineEventTextUseEllipsis: boolean;
	TimelineEventBoxShowColor: boolean;
	TimelineEventBoxShowColorOnBottom: boolean;	// If yes, color will be a thin strip on the bottom, if no, it will be near stem side
	TimelineEventHasHoverHighlight: boolean;
	TimelineEventHoverColor: string;
	// Age and period related
	TimelineAgeHeight: number;
	TimelineAgeCornerRounding: number;
	TimelinePeriodHeight: number;
	TimelinePeriodCornerRounding: number;
	TimelinePeriodYMargin: number;
	TimelinePeriodYOffset: number;
	// Box types: Character, Note, Image
	TimelineBoxTypesShowAsBox: boolean;	// Show as a box or show as a normal Event?
	TimelineBoxTypesBoxWidth: number;	// If show as box, what should the dimensions be?
	TimelineBoxTypesShowImage: boolean;	// Should the type contain a visible image, eg character image or note icon etc
	// Timeline misc
	TimelineCanvasBackgroundColor: string;
	TimelineShowNowLine: boolean;
	TimelineShowNowLineText: boolean;
	TimelineNowLineColor: string;
	TimelineNowLineStyle: string;	// Dahsed, solid etc

	TimelineTickDistance: number;	// Distance between two ticks
	TimelineTickWidth: number;		// Width of a tick, eg 1px
	TimelineNonYearTicksSmaller: boolean;

	TimelineTickMarkerFontFamily: string;
	TimelineTickMarkerFontStyle: string;
	TimelineTickMarkerTextColor: string;
	TimelineTickMarkerFontSize: number;
	TimelineTickMarkerTextAlwaysOnTop: boolean;

	TimelineShowHoverLine: boolean;	// The line that always snaps to the nearest year and shows the year number
	TimelineHoverLineColor: string;
	TimelineHoverLineStyle: string;
	TimelineHoverLineWidth: number;

	TimelineEdgeMarginWidth: number;

	TimelineDataRangeWidth: number;
	TimelineIsDataRangeVisible: boolean;
	TimelineDataRangeColor: string;

	TimelineAnimateOnJumpToYear: boolean;
	TimelineJumpToYearAnimationLength: number;

	TimelineAnimateLodChange: boolean;
	TimelineLodChangeAnimationLength: number;

	// Tick & axis line colors
	TimelineTickColor: string;
	TimelineAxisColor: string;

	// Notes panel
	NotesPanelBackgroundColor: string;
	NotesPanelCardBackgroundColor: string;
	NotesPanelTextColor: string;
	NotesPanelHeadingColor: string;
	NotesPanelAccentColor: string;
	NotesPanelFontSize: number;

	// Data panel (upper-right item display)
	DataPanelBackgroundColor: string;
	DataPanelCardBackgroundColor: string;
	DataPanelH1Color: string;
	DataPanelH2Color: string;
	DataPanelH3Color: string;
	DataPanelH4Color: string;
	DataPanelFontFamily: string;
	DataPanelFontSize: number;

	// Gallery panel
	GalleryPanelBackgroundColor: string;
	GalleryPanelBorderColor: string;
	GalleryPanelTextColor: string;

	// Calendar panel (gallery tab)
	CalendarPanelBackgroundColor: string;
	CalendarPanelBorderColor: string;
	CalendarPanelTextColor: string;
	CalendarPanelWeekHighlightColor: string;
	CalendarPanelDayHighlightColor: string;

	// Calendar overlay
	TimelineCalendarOverlayEnabled: boolean;
	TimelineCalendarOverlaySeasonColor: string;
	TimelineCalendarOverlayMonthColor: string;
	TimelineCalendarOverlayWeekColor: string;
	TimelineCalendarOverlayDayColor: string;
	// Time break strips
	TimelineBreakFillColor: string;
	TimelineBreakBorderColor: string;
	// Measurement overlay
	MeasureLineColor: string;
}

export interface ImportPreview {
	sourcePath: string;
	isV2: boolean;
	timelineCount: number;
	itemCount: number;
	conflictingTimelines: string[];
}

export interface BackupInfo {
	FileName: string;
	FullPath: string;
	CreatedAt: string;
	SizeBytes: number;
	HasMedia: boolean;
}

export interface BackupSettings {
	interval: string;
	lastAutoBackupAt: string | null;
	backupsFolder: string;
	recentBackups: BackupInfo[];
}

export interface TimelineImportPreview {
	sourcePath: string;
	timelineTitle: string;
	includeIds: boolean;
	hasMedia: boolean;
	itemCount: number;
	mediaCount: number;
	hasConflict: boolean;
	conflictingTimelineTitle: string | null;
	timelineId: number | null;
}

export interface MemDayMarker {
    id: string
    name: string
    color: string
    type: 'fixed' | 'weekly' | 'relative'
    startMonth: number
    startDay: number
    endMonth: number
    endDay: number
    isRange: boolean
    weekDays: number[]
}
