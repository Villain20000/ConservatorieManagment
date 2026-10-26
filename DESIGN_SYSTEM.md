# MusicOS — Design System & UX/UI Specifications

**Document Version:** 1.0.0  
**Design Philosophy:** Modern, minimal, distraction-free, and high-density.  
**Inspiration:** Clean utility inspired by Linear, Notion, and Stripe Dashboard, tailored specifically for musical education workflows.  
**Accessibility Target:** WCAG 2.2 Level AA Compliance across all views.

---

## 1. Visual Direction & Brand Tokens

MusicOS employs a neutral visual foundation balanced with refined **violet and indigo** accents that evoke musical depth, concentration, and elegance.

### 1.1 Color Palette & Semantic Tokens

#### Neutral Base (Slate / Zinc)
- **Background (Light):** `#FAFAFA` (Slate-50)
- **Surface / Card (Light):** `#FFFFFF` (White) with subtle borders (`#E2E8F0` / Slate-200)
- **Text Primary (Light):** `#0F172A` (Slate-900)
- **Text Muted (Light):** `#64748B` (Slate-500)
- **Background (Dark):** `#0B0F19` (Deep Slate-950)
- **Surface / Card (Dark):** `#111827` (Slate-900) with borders (`#1F2937` / Slate-800)
- **Text Primary (Dark):** `#F8FAFC` (Slate-50)
- **Text Muted (Dark):** `#94A3B8` (Slate-400)

#### Brand Accent (Violet / Indigo)
- **Primary Violet:** `#7C3AED` (`violet-600`) / Dark: `#8B5CF6` (`violet-500`)
- **Primary Hover:** `#6D28D9` (`violet-700`)
- **Accent Indigo:** `#4F46E5` (`indigo-600`)
- **Subtle Accent Wash:** `#F5F3FF` (`violet-50`) / Dark: `rgba(124, 58, 237, 0.12)`

#### Semantic Status Tokens
- **Success (Present, Paid, Approved):** `#059669` (`emerald-600`) / Background: `#ECFDF5` (`emerald-50`)
- **Warning (Late, Partial, Due Soon):** `#D97706` (`amber-600`) / Background: `#FFFBEB` (`amber-50`)
- **Danger (Absent, Overdue, Cancelled):** `#DC2626` (`red-600`) / Background: `#FEF2F2` (`red-50`)
- **Info (Scheduled, Draft):** `#2563EB` (`blue-600`) / Background: `#EFF6FF` (`blue-50`)

---

### 1.2 Typography & Scale

The system utilizes **Inter Variable** (`@fontsource-variable/inter`) for crisp readability across dense timetables and financial tables.

| Level | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| Display | 2rem (32px) | Bold (700) | 1.25 | Landing, high-level dashboards |
| Title Large | 1.5rem (24px) | Semi-Bold (600) | 1.3 | Page headers |
| Title Medium | 1.25rem (20px) | Semi-Bold (600) | 1.4 | Card headers, drawer titles |
| Body Large | 1rem (16px) | Regular (400) | 1.5 | Primary copy, modal text |
| Body Medium | 0.875rem (14px) | Regular / Medium | 1.5 | Table cells, form fields, badges |
| Caption / Mono | 0.75rem (12px) | Medium (500) | 1.4 | Timetable times, protocol numbers |

---

## 2. Core Reusable Component Library (26 Components)

### Layout & Navigation Primitives
1. **`AppShell`:** Responsive application container managing sidebar toggle, topbar sync, support banner, and main content viewports.
2. **`Sidebar`:** Collapsible navigation rail displaying role-scoped links, active indicator pills, and tenant switchers.
3. **`Topbar`:** Breadcrumb trail, global search trigger (`Cmd+K`), notification bell indicator, language toggle, and user avatar.
4. **`Breadcrumbs`:** Contextual navigational path with route links.
5. **`SearchPanel`:** Global command palette modal searching students, teachers, documents, and settings.
6. **`NotificationCenter`:** Slide-over inbox rendering unread alerts with direct action links.

### Data & Dense Grid Primitives
7. **`DataTable`:** High-performance tabular display with column sorting, checkbox selection, pagination, and empty state fallbacks.
8. **`FilterBar`:** Unified filter toolbar supporting search input, multi-select dropdowns, date range pickers, and view resets.
9. **`Calendar`:** Multi-view monthly, weekly, and daily scheduling grid with branch, teacher, and studio room filters.
10. **`TimetableGrid`:** High-density weekly studio timetable visualizing 1-on-1 and group lesson blocks with conflict overlays.
11. **`AnalyticsCard`:** Metric summary tile displaying primary KPI, delta indicator (e.g. `+12%`), sparkline trend, and period badge.

### Action, Form & Feedback Primitives
12. **`FormField`:** Accessible wrapper providing labels, hints, validation error messages, and required indicators.
13. **`Modal`:** Dialog container with keyboard dismiss (`Esc`), focus trapping, header actions, and footer controls.
14. **`Drawer`:** Slide-over detail panel for inspecting student dossiers, lesson metadata, or document versions without page reload.
15. **`ConfirmationDialog`:** Destructive action confirmation modal requiring explicit acknowledgment.
16. **`StatusBadge`:** Pill badge mapping domain statuses (`PRESENT`, `ABSENT`, `PAID`, `OVERDUE`) to semantic tokens.
17. **`EmptyState`:** Informative, graphic placeholder displayed when lists or search queries return zero records.
18. **`ErrorState`:** Visual error card with retry triggers and support diagnostic codes.
19. **`LoadingState`:** Subtle skeleton shimmer loaders mirroring the expected geometry of cards and tables.
20. **`PermissionGuard`:** Structural directive (`*hasPermission="'finance.write'"`) toggling elements based on verified user claims.

### Specialized Music Education Primitives
21. **`LessonCard`:** Compact timetable tile displaying student name, instrument, time range, room, and attendance status indicator.
22. **`StudentCard`:** Profile card displaying student photo/avatar, student ID (AM), academic program, study level, and active balance.
23. **`TeacherCard`:** Faculty directory card highlighting specialties, studio branch, and active student quota.
24. **`FinancialSummary`:** Visual ledger balance widget showing billed tuition, paid credits, and outstanding arrears.
25. **`DocumentViewer`:** Canvas-based vector PDF viewer with zooming, page flipping, printing, and draft watermarks.
26. **`AudioPlayer`:** Specialized web-audio study player featuring waveform display, speed control (0.5x–1.0x), and A/B loop controls.

---

## 3. Responsive Breakpoints & Device Formats

- **Desktop (>= 1280px):** Permanent sidebar navigation, multi-column data tables, high-density weekly schedule grids, and multi-pane detail drawers.
- **Tablet (768px – 1279px):** Collapsible sidebar rail, touch-friendly attendance marking buttons, card-table hybrid views, and optimized landscape timetable viewports.
- **Mobile (< 768px):** Bottom navigation bar for student and parent portals, touch-optimized card stacks, single-day schedule views, and full-screen drawer dialogs.

---

## 4. Accessibility & Inclusive Design (WCAG 2.2 AA)

1. **Color Contrast:** All body text meets a minimum contrast ratio of 4.5:1 against surfaces (3:1 for large display headers).
2. **Keyboard Navigation:** Complete end-to-end functionality operable via keyboard (`Tab`, `Shift+Tab`, `Enter`, `Space`, `Esc`, arrow keys).
3. **Focus Rings:** Distinct, high-visibility 2px focus outlines (`ring-2 ring-violet-500 ring-offset-2`).
4. **Reduced Motion:** Respects `prefers-reduced-motion: reduce`, disabling smooth transitions and animations for users sensitive to motion.
5. **Screen Reader Optimization:** Form controls utilize `aria-describedby` for error states; dynamic elements utilize `aria-live="polite"`.
