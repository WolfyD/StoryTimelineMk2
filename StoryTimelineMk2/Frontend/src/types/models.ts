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

export interface FullTimelineProject {
    Project: TimelineProject;
    Items: TimelineItem[];
	Notes: TimelineNote[];
}

export interface Calendar {
	Id: string;
	Name: string;
	ShortName: string;
	AlternateName: string;
	NameBefore0: string;
	NameAfter0: string;
	DefaultCalendar: boolean;
	Year0AtDefault: number;
	LodProfile: LodProfile;
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
