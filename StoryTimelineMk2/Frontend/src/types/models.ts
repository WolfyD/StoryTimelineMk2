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
	/** BL-72, ages and periods: reaches back past the start year — drawn as an arrow, not an edge. */
	OpenStart?: boolean;
	/** BL-72, ages and periods: carries on past the end year. Both may be set. */
	OpenEnd?: boolean;
	/** BL-72: soften whichever side is open — half-transparent at the tip, solid a year in. */
	OpenFade?: boolean;
	/** Read-only, type 7 only: the owning character's UseHighlightColor, joined in by the backend. */
	UseHighlightColor?: boolean;
	/** Writer's private notes: stored and exported, never rendered anywhere */
	ItemNotes?: string | null;
	/** BL-16 groundwork: will hold a location id once locations exist. Nothing reads it yet. */
	LocationId?: string | null;
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
	/**
	 * BL-80: pixels between two ticks at this rung, overriding `TimelineTickDistance`. Opt-in —
	 * absent or 0 means inherit, which is what every profile said before this existed.
	 */
	tickDistance?: number;
}

/** One item a character appears in — the character window's reverse list. */
export interface CharacterAppearance {
	ItemId: string;
	Title: string;
	TypeId: number;
	Year: number;
	AbsoluteStart: number;
	Color: string | null;
	Role: string | null;
}

export interface CharacterItem {
	Id: string;
	/** Derived from FirstName + LastName by the backend on save — never set it directly. */
	Name: string;
	FirstName: string;
	LastName: string;
	Nicknames: string | null;
	Aliases: string | null;
	Race: string | null;
	/** Free text like Race: house, guild, army, cult. The relations views group the cast by it. */
	Faction: string | null;
	Description: string | null;
	Notes: string | null;
	BirthYear: number | null;
	BirthDate: string | null;
	BirthAlternativeYear: string | null;
	DeathYear: number | null;
	DeathDate: string | null;
	DeathAlternativeYear: string | null;
	/** The LOD each date was picked at; the sub-year part lives in the absolutes below. */
	BirthGranularity: number;
	DeathGranularity: number;
	/** Birth and death as timeline positions, the same pair an item carries. Null means no date. */
	AbsoluteStart: number | null;
	AbsoluteEnd: number | null;
	Color: string | null;
	Importance: number;
	PortraitPictureId: string | null;
	/** Read-only: the portrait's media-relative path, joined in by the backend. */
	PortraitPath: string | null;
	/** Overrides what the dates imply; null (the normal case) means derive it from DeathYear. */
	State: string | null;
	/**
	 * Free text with a suggested list behind it. Only the relation wording reads it, and only to
	 * pick 'mother of' over 'parent of'; anything it does not recognise gets the neutral phrase.
	 */
	Gender: string | null;
	/** Draw birth and death as two items this character owns. */
	ShowOnTimeline: boolean;
	/** Fill the portrait disc with Color instead of leaving it neutral; the ring is colored either way. */
	UseHighlightColor: boolean;
	BirthItemId: string | null;
	DeathItemId: string | null;
	/** BL-16 groundwork: will hold location ids once locations exist. Nothing reads them yet. */
	BirthLocationId: string | null;
	DeathLocationId: string | null;
	/** In every timeline's cast, not only TimelineId's — which stays as where they came from. */
	Shared: boolean;
	TimelineId: number;
}

/**
 * One relation between two characters, stored once for the pair: the kind carries both readings
 * (`AToB` / `BToA`), so there is no mirror row to keep in step.
 */
export interface CharacterRelationship {
	Id: number;
	Character1Id: string;
	Character2Id: string;
	/** A `RelationshipType.Id`; kept as written even if the kind is later deleted. */
	RelationshipType: string;
	Notes: string | null;
	/** Null means the relation is implied by its kind — a son is one from birth — not year 0. */
	StartYear: number | null;
	StartGranularity: number;
	EndYear: number | null;
	EndGranularity: number;
	/** Both ends as timeline positions; null where that end has no year. */
	AbsoluteStart: number | null;
	AbsoluteEnd: number | null;
	/** How close they are, 0–100: the edge's thickness and how hard its spring pulls. */
	RelationshipStrength: number;
	/** A state word on the tie — estranged, secret, adoptive, former, alleged. Also its line style. */
	RelationshipModifier: string | null;
	/** A genealogical qualifier — half-, step-, once removed — folded into the wording. */
	RelationshipDegree: string | null;
	TimelineId: number;
}

/** A kind of relation, and how it reads from each end. Seeded with a starter set, editable. */
export interface RelationshipType {
	Id: string;
	Name: string;
	/** Loose grouping for the picker — 'family', 'social', or whatever the user types. */
	Type: string | null;
	AToB: string | null;
	BToA: string | null;
	/** The same phrase for a female or male subject; null where English has no gendered word. */
	AToBF: string | null;
	AToBM: string | null;
	BToAF: string | null;
	BToAM: string | null;
	OneWay: number;
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
	/** The name matcher attached this one rather than the user (BL-15 phase 2). */
	AutoDetected?: boolean;
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
	/** Characters the user took off this item — the matcher leaves these alone. */
	Dismissals: string[];
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
	TimelinePictureCaptionFontSize: number;	// Caption strip under a picture
	TimelineCharacterCaptionFontSize: number;	// Caption under a portrait — generated titles run long
	// Timeline misc
	TimelineCanvasBackgroundColor: string;
	TimelineShowNowLine: boolean;
	TimelineShowNowLineText: boolean;
	TimelineNowLineColor: string;
	TimelineNowLineStyle: string;	// Dahsed, solid etc
	TimelineNowLineWidth: number;

	TimelineTickDistance: number;	// Distance between two ticks
	TimelineTickWidth: number;		// Width of a tick, eg 1px
	TimelineNonYearTicksSmaller: boolean;

	TimelineTickMarkerFontFamily: string;
	TimelineTickMarkerFontStyle: string;
	TimelineTickMarkerTextColor: string;
	TimelineTickMarkerFontSize: number;
	TimelineTickMarkerTextAlwaysOnTop: boolean;
	TimelineTickMarkerTextAngled: boolean;

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

// ── BL-33: session changes (.stlc) ──────────────────────────────────────────

/** One item in the My work tab's list of what the ticked days touched. */
export interface SessionEntry {
	id: string;
	op: 'insert' | 'update' | 'delete';
	title: string;
}

/** One day the timeline was worked on, as the export screen lists it. */
export interface SessionDaySummary {
	day: string;
	startedAt: string;
	added: number;
	changed: number;
	removed: number;
	/** Today: still being written to, so its counts are computed live. */
	open: boolean;
}

export interface SessionHistory {
	timelineTitle: string;
	lastExportedAt: string | null;
	/** The newest day the last export covered; “everything since” starts the day after. */
	lastExportDay: string | null;
	days: SessionDaySummary[];
}

export interface SessionChangeSummary {
	sessionStartedAt: string;
	timelineTitle: string;
	added: number;
	changed: number;
	removed: number;
	entries: SessionEntry[];
}

/** One column of the side-by-side comparison. Already formatted for display. */
export interface SessionSide {
	title: string;
	when: string;
	description: string;
	tags: string;
	updatedAt: string;
}

export interface SessionChangeEntryPreview {
	id: string;
	op: 'insert' | 'update' | 'delete';
	title: string;
	/** This copy edited the same item, so taking the incoming version overwrites work. */
	collision: boolean;
	/** No such item here: an update lands as a new one, a delete does nothing. */
	missingLocally: boolean;
	incoming: SessionSide | null;
	local: SessionSide | null;
}

export interface SessionChangePreview {
	sourcePath: string;
	timelineTitle: string;
	exportedAt: string;
	targetTimelineId: number;
	targetTimelineTitle: string;
	added: number;
	changed: number;
	removed: number;
	collisions: number;
	entries: SessionChangeEntryPreview[];
}

export interface SessionApplyResult {
	applied: number;
	kept: number;
	/** Links to characters, stories or chapters this copy does not have. */
	dropped: number;
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
