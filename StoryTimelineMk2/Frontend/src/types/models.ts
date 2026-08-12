import type Konva from "konva";

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
    Font: string;
    FontSizeScale: number;
    PixelsPerSubtick: number;
    CustomCss: string;
    UseCustomCss: boolean;
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
	Id: string; // UUID
    NoteContents: string;
    ConnectedItemId: string;
	TimelineId: number;
	UpdatedAt: Date;
}

export interface HiddenRange {
    Id: number;
    TimelineId: number;
    StartYear: number;
    EndYear: number;
    Label: string | null;
}

export interface FullTimelineProject {
    Project: TimelineProject;
    Items: TimelineItem[];
	Notes: TimelineNote[];
    HiddenRanges: HiddenRange[];
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
}

export interface TimelineItem {
    Id: string; // UUID
	Title: string;
	Description: string;
	Content: string;
	StoryId: string | null;
	TypeId: number;
	Year: number;
	AbsoluteStart: number;
	Subtick: number;
	OriginalSubtick: number;
	EndYear: number;
	AbsoluteEnd: number;
	EndSubtick: number;
	OriginalEndSubtick: number;
	BookTitle: string;
	Chapter: string;
	Page: string;
	Color: string;
	CreationGranularity: number;
	TimelineId: number;
	ItemIndex: number;
	ShowInNotes: boolean;
	Importance: number;
	MinLodLevel: number;
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
}
