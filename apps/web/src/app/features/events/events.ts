import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoService } from '@jsverse/transloco';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import type {
  AcademicsOptions,
  Branch,
  EventItem,
  EventPerformance,
  EventType,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

@Component({
  selector: 'app-events-page',
  imports: [...SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="events.title" subtitle="events.subtitle">
        @if (canWrite()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <app-icon name="plus" [size]="16" />
            {{ 'events.newEvent' | transloco }}
          </button>
        }
      </app-page-header>

      <!-- Stats Bar -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="card p-4 flex items-center gap-3">
          <div class="p-3 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            <app-icon name="calendar" [size]="22" />
          </div>
          <div>
            <div class="text-xs text-slate-500 uppercase tracking-wide">{{ 'events.totalEvents' | transloco }}</div>
            <div class="text-xl font-bold">{{ events().length }}</div>
          </div>
        </div>
        <div class="card p-4 flex items-center gap-3">
          <div class="p-3 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <app-icon name="check-circle" [size]="22" />
          </div>
          <div>
            <div class="text-xs text-slate-500 uppercase tracking-wide">{{ 'events.upcoming' | transloco }}</div>
            <div class="text-xl font-bold">{{ upcomingCount() }}</div>
          </div>
        </div>
        <div class="card p-4 flex items-center gap-3">
          <div class="p-3 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
            <app-icon name="music" [size]="22" />
          </div>
          <div>
            <div class="text-xs text-slate-500 uppercase tracking-wide">{{ 'events.performances' | transloco }}</div>
            <div class="text-xl font-bold">{{ totalPerformances() }}</div>
          </div>
        </div>
        <div class="card p-4 flex items-center gap-3">
          <div class="p-3 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <app-icon name="users" [size]="22" />
          </div>
          <div>
            <div class="text-xs text-slate-500 uppercase tracking-wide">{{ 'events.registrations' | transloco }}</div>
            <div class="text-xl font-bold">{{ totalRegistrations() }}</div>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="card p-4 mb-6 flex flex-wrap gap-3 items-center justify-between">
        <div class="flex flex-wrap gap-3 items-center flex-1">
          <div class="relative min-w-[200px] flex-1 max-w-xs">
            <app-icon name="search" [size]="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              class="input pl-9"
              [placeholder]="'events.searchPlaceholder' | transloco"
              [value]="searchTerm()"
              (input)="updateSearch($any($event.target).value)"
            />
          </div>

          <select class="input max-w-[160px]" [value]="selectedType()" (change)="selectedType.set($any($event.target).value)">
            <option value="">{{ 'events.allTypes' | transloco }}</option>
            <option value="CONCERT">{{ 'events.types.CONCERT' | transloco }}</option>
            <option value="RECITAL">{{ 'events.types.RECITAL' | transloco }}</option>
            <option value="MASTERCLASS">{{ 'events.types.MASTERCLASS' | transloco }}</option>
            <option value="AUDITION">{{ 'events.types.AUDITION' | transloco }}</option>
            <option value="WORKSHOP">{{ 'events.types.WORKSHOP' | transloco }}</option>
          </select>

          @if (branches().length > 1) {
            <select class="input max-w-[160px]" [value]="selectedBranch()" (change)="selectedBranch.set($any($event.target).value)">
              <option value="">{{ 'events.allBranches' | transloco }}</option>
              @for (b of branches(); track b.id) {
                <option [value]="b.id">{{ b.name }}</option>
              }
            </select>
          }
        </div>
      </div>

      <!-- Events List -->
      @if (loading()) {
        <div class="card p-8 text-center text-slate-500">
          <app-icon name="refresh" [size]="24" class="animate-spin mx-auto mb-2 text-slate-400" />
          {{ 'common.loading' | transloco }}
        </div>
      } @else if (filteredEvents().length === 0) {
        <div class="card p-12 text-center text-slate-500">
          <app-icon name="calendar" [size]="40" class="mx-auto mb-3 text-slate-300" />
          <h3 class="text-base font-semibold mb-1">{{ 'events.noEvents' | transloco }}</h3>
          <p class="text-sm text-slate-400 mb-4">{{ 'events.noEventsHint' | transloco }}</p>
          @if (canWrite()) {
            <button type="button" class="btn btn-secondary" (click)="openCreate()">
              {{ 'events.newEvent' | transloco }}
            </button>
          }
        </div>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          @for (e of filteredEvents(); track e.id) {
            <div class="card hover:border-brand-500/50 transition-all flex flex-col justify-between p-5">
              <div>
                <div class="flex items-center justify-between gap-2 mb-2">
                  <span class="badge" [class]="getTypeBadgeClass(e.eventType)">
                    {{ 'events.types.' + e.eventType | transloco }}
                  </span>
                  <span class="text-xs font-semibold px-2 py-0.5 rounded-full" [class]="getStatusClass(e.status)">
                    {{ 'events.status.' + e.status | transloco }}
                  </span>
                </div>

                <h3 class="font-bold text-lg mb-2 text-slate-900 dark:text-slate-100 line-clamp-1">
                  {{ e.title }}
                </h3>

                <div class="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 mb-4">
                  <div class="flex items-center gap-2">
                    <app-icon name="calendar" [size]="14" class="text-slate-400" />
                    <span>{{ formatDate(e.startsAt) }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <app-icon name="clock" [size]="14" class="text-slate-400" />
                    <span>{{ formatTime(e.startsAt) }} - {{ formatTime(e.endsAt) }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <app-icon name="building" [size]="14" class="text-slate-400" />
                    <span>{{ e.branch?.name }} @if (e.room) { • {{ e.room.name }} }</span>
                  </div>
                </div>
              </div>

              <div class="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div class="text-xs text-slate-500">
                  <span class="font-medium text-slate-700 dark:text-slate-300">{{ e._count?.performances || 0 }}</span> {{ 'events.slots' | transloco }} •
                  <span class="font-medium text-slate-700 dark:text-slate-300">{{ e._count?.registrations || 0 }}/{{ e.maxCapacity }}</span>
                </div>

                <div class="flex items-center gap-2">
                  <button type="button" class="btn btn-sm btn-secondary" (click)="openDetail(e.id)">
                    <app-icon name="list" [size]="14" />
                    {{ 'events.stageOrder' | transloco }}
                  </button>
                  @if (canWrite()) {
                    <button type="button" class="btn btn-sm btn-ghost text-red-600" (click)="deleteEvent(e)">
                      <app-icon name="trash" [size]="14" />
                    </button>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }

      <!-- Event Detail & Stage Running Order Modal -->
      @if (activeEvent(); as event) {
        <div class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div class="card w-full max-w-4xl max-h-[90vh] flex flex-col p-6 animate-in fade-in zoom-in-95 duration-150">
            <!-- Modal Header -->
            <div class="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="badge" [class]="getTypeBadgeClass(event.eventType)">
                    {{ 'events.types.' + event.eventType | transloco }}
                  </span>
                  <span class="text-xs text-slate-500">{{ formatDate(event.startsAt) }} • {{ formatTime(event.startsAt) }}</span>
                </div>
                <h2 class="text-xl font-bold">{{ event.title }}</h2>
                <div class="text-xs text-slate-500">
                  {{ event.branch?.name }} @if (event.room) { • {{ event.room.name }} ({{ 'events.capacity' | transloco }}: {{ event.maxCapacity }}) }
                </div>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" (click)="activeEvent.set(null)">
                <app-icon name="x" [size]="20" />
              </button>
            </div>

            <!-- Modal Tabs -->
            <div class="flex border-b border-slate-200 dark:border-slate-800 mt-2">
              <button
                type="button"
                class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
                [class.border-brand-500]="activeTab() === 'stage'"
                [class.text-brand-600]="activeTab() === 'stage'"
                [class.border-transparent]="activeTab() !== 'stage'"
                [class.text-slate-500]="activeTab() !== 'stage'"
                (click)="activeTab.set('stage')"
              >
                {{ 'events.stageRunningOrder' | transloco }}
              </button>
              <button
                type="button"
                class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
                [class.border-brand-500]="activeTab() === 'checkin'"
                [class.text-brand-600]="activeTab() === 'checkin'"
                [class.border-transparent]="activeTab() !== 'checkin'"
                [class.text-slate-500]="activeTab() !== 'checkin'"
                (click)="activeTab.set('checkin')"
              >
                {{ 'events.qrCheckin' | transloco }}
              </button>
              <button
                type="button"
                class="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
                [class.border-brand-500]="activeTab() === 'program'"
                [class.text-brand-600]="activeTab() === 'program'"
                [class.border-transparent]="activeTab() !== 'program'"
                [class.text-slate-500]="activeTab() !== 'program'"
                (click)="loadProgram(event.id)"
              >
                {{ 'events.digitalProgram' | transloco }}
              </button>
            </div>

            <!-- Tab 1: Stage Running Order -->
            @if (activeTab() === 'stage') {
              <div class="flex-1 overflow-y-auto py-4 space-y-6">
                <!-- Part 1 -->
                <div>
                  <div class="flex items-center justify-between mb-3 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg">
                    <h4 class="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      {{ 'events.part1' | transloco }}
                    </h4>
                    <span class="text-xs text-slate-500">
                      {{ calculatePartDuration(1) }} {{ 'events.minutes' | transloco }}
                    </span>
                  </div>

                  @if (getPartPerformances(1).length === 0) {
                    <div class="p-4 text-center text-sm text-slate-400 border border-dashed rounded-lg">
                      {{ 'events.noPerformancesInPart' | transloco }}
                    </div>
                  } @else {
                    <div class="space-y-2">
                      @for (p of getPartPerformances(1); track p.id; let idx = $index; let total = $count) {
                        <div class="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                          <div class="flex items-center gap-3">
                            <span class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600">
                              {{ idx + 1 }}
                            </span>
                            <div>
                              <div class="font-bold text-sm text-slate-900 dark:text-slate-100">
                                {{ p.performerDisplayName }}
                                @if (p.student) {
                                  <span class="text-xs font-normal text-slate-400">({{ p.student.registrationNumber }})</span>
                                }
                              </div>
                              <div class="text-xs text-slate-600 dark:text-slate-400">
                                <span class="font-medium">{{ p.composer }}:</span> {{ p.pieceTitle }}
                                @if (p.movement) { • <em>{{ p.movement }}</em> }
                              </div>
                              @if (p.stageNotes) {
                                <div class="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                                  {{ p.stageNotes }}
                                </div>
                              }
                            </div>
                          </div>

                          <div class="flex items-center gap-3">
                            <span class="text-xs font-mono text-slate-500">{{ formatDuration(p.durationSeconds) }}</span>

                            @if (canCurate()) {
                              <div class="flex items-center gap-1">
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-xs p-1"
                                  [disabled]="idx === 0"
                                  (click)="movePerformance(p, 'up')"
                                >
                                  <app-icon name="arrow-up" [size]="14" />
                                </button>
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-xs p-1"
                                  [disabled]="idx === total - 1"
                                  (click)="movePerformance(p, 'down')"
                                >
                                  <app-icon name="arrow-down" [size]="14" />
                                </button>
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-xs p-1 text-red-500 hover:text-red-700"
                                  (click)="removePerformance(p.id)"
                                >
                                  <app-icon name="trash" [size]="14" />
                                </button>
                              </div>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Intermission -->
                <div class="flex items-center justify-center gap-2 py-2 border-y border-dashed border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-500">
                  <app-icon name="timer" [size]="14" />
                  {{ 'events.intermission' | transloco }} ({{ event.intermissionDurationMinutes }} {{ 'events.minutes' | transloco }})
                </div>

                <!-- Part 2 -->
                <div>
                  <div class="flex items-center justify-between mb-3 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg">
                    <h4 class="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      {{ 'events.part2' | transloco }}
                    </h4>
                    <span class="text-xs text-slate-500">
                      {{ calculatePartDuration(2) }} {{ 'events.minutes' | transloco }}
                    </span>
                  </div>

                  @if (getPartPerformances(2).length === 0) {
                    <div class="p-4 text-center text-sm text-slate-400 border border-dashed rounded-lg">
                      {{ 'events.noPerformancesInPart' | transloco }}
                    </div>
                  } @else {
                    <div class="space-y-2">
                      @for (p of getPartPerformances(2); track p.id; let idx = $index; let total = $count) {
                        <div class="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                          <div class="flex items-center gap-3">
                            <span class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600">
                              {{ idx + 1 }}
                            </span>
                            <div>
                              <div class="font-bold text-sm text-slate-900 dark:text-slate-100">
                                {{ p.performerDisplayName }}
                              </div>
                              <div class="text-xs text-slate-600 dark:text-slate-400">
                                <span class="font-medium">{{ p.composer }}:</span> {{ p.pieceTitle }}
                                @if (p.movement) { • <em>{{ p.movement }}</em> }
                              </div>
                            </div>
                          </div>

                          <div class="flex items-center gap-3">
                            <span class="text-xs font-mono text-slate-500">{{ formatDuration(p.durationSeconds) }}</span>

                            @if (canCurate()) {
                              <div class="flex items-center gap-1">
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-xs p-1"
                                  [disabled]="idx === 0"
                                  (click)="movePerformance(p, 'up')"
                                >
                                  <app-icon name="arrow-up" [size]="14" />
                                </button>
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-xs p-1"
                                  [disabled]="idx === total - 1"
                                  (click)="movePerformance(p, 'down')"
                                >
                                  <app-icon name="arrow-down" [size]="14" />
                                </button>
                                <button
                                  type="button"
                                  class="btn btn-ghost btn-xs p-1 text-red-500 hover:text-red-700"
                                  (click)="removePerformance(p.id)"
                                >
                                  <app-icon name="trash" [size]="14" />
                                </button>
                              </div>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>

                <!-- Add Performer Slot -->
                @if (canCurate()) {
                  <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <form [formGroup]="perfForm" (ngSubmit)="submitPerformance()" class="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input type="text" formControlName="performerDisplayName" class="input" [placeholder]="'events.performerName' | transloco" />
                      <input type="text" formControlName="composer" class="input" [placeholder]="'events.composer' | transloco" />
                      <input type="text" formControlName="pieceTitle" class="input" [placeholder]="'events.pieceTitle' | transloco" />
                      <input type="text" formControlName="movement" class="input" [placeholder]="'events.movement' | transloco" />
                      <input type="number" formControlName="durationSeconds" class="input" [placeholder]="'events.durationSeconds' | transloco" />
                      <select formControlName="part" class="input">
                        <option [value]="1">{{ 'events.part1' | transloco }}</option>
                        <option [value]="2">{{ 'events.part2' | transloco }}</option>
                      </select>
                      <div class="md:col-span-3 flex justify-end">
                        <button type="submit" class="btn btn-primary btn-sm" [disabled]="perfForm.invalid || addingSlot()">
                          <app-icon name="plus" [size]="14" />
                          {{ 'events.addPerformerSlot' | transloco }}
                        </button>
                      </div>
                    </form>
                  </div>
                }
              </div>
            }

            <!-- Tab 2: Fast QR Check-In -->
            @if (activeTab() === 'checkin') {
              <div class="flex-1 overflow-y-auto py-4 space-y-6">
                <div class="card p-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <h4 class="font-bold text-base mb-1">{{ 'events.quickTicketScan' | transloco }}</h4>
                  <p class="text-xs text-slate-500 mb-4">{{ 'events.scanHint' | transloco }}</p>

                  <div class="flex gap-3">
                    <input
                      type="text"
                      class="input flex-1 font-mono uppercase text-base"
                      placeholder="TKT-XXXXXX"
                      [value]="scanCode()"
                      (input)="scanCode.set($any($event.target).value)"
                      (keyup.enter)="executeCheckin()"
                    />
                    <button type="button" class="btn btn-primary" (click)="executeCheckin()" [disabled]="!scanCode().trim() || checkingIn()">
                      <app-icon name="check" [size]="16" />
                      {{ 'events.admitAttendee' | transloco }}
                    </button>
                  </div>

                  @if (checkinResult(); as res) {
                    <div class="mt-4 p-4 rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between">
                      <div>
                        <div class="font-bold text-sm">{{ res.attendeeName }}</div>
                        <div class="text-xs font-mono">{{ res.ticketCode }} @if (res.seatNumber) { • {{ res.seatNumber }} }</div>
                      </div>
                      <span class="badge bg-emerald-600 text-white font-bold">{{ 'events.admitted' | transloco }}</span>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Tab 3: Digital Program Preview -->
            @if (activeTab() === 'program') {
              <div class="flex-1 overflow-y-auto py-6 px-8 max-w-2xl mx-auto font-serif text-slate-800 dark:text-slate-200">
                @if (programData(); as p) {
                  <div class="text-center mb-8 border-b pb-6 border-slate-300 dark:border-slate-700">
                    <div class="text-xs uppercase tracking-widest text-slate-500 mb-2 font-sans">{{ p.branchName }}</div>
                    <h1 class="text-2xl font-bold mb-2">{{ p.title }}</h1>
                    <div class="text-xs text-slate-500 font-sans">
                      {{ formatDate(p.startsAt) }} • {{ p.roomName }} • {{ 'events.approxRunningTime' | transloco }}: {{ p.totalEstimatedMinutes }}'
                    </div>
                  </div>

                  <div class="mb-8">
                    <h3 class="text-sm font-sans font-bold uppercase tracking-widest text-center mb-4 text-brand-600">
                      {{ 'events.part1' | transloco }}
                    </h3>
                    <div class="space-y-4">
                      @for (item of p.part1.performances; track item.id) {
                        <div class="border-b border-dashed border-slate-200 dark:border-slate-800 pb-2">
                          <div class="flex justify-between items-baseline font-bold text-sm">
                            <span>{{ item.composer }}</span>
                            <span class="text-xs font-sans text-slate-500">{{ formatDuration(item.durationSeconds) }}</span>
                          </div>
                          <div class="text-xs italic">{{ item.pieceTitle }} @if (item.movement) { ({{ item.movement }}) }</div>
                          <div class="text-xs font-sans text-slate-600 dark:text-slate-400 mt-0.5">
                            {{ item.performerDisplayName }}
                          </div>
                        </div>
                      }
                    </div>
                  </div>

                  @if (p.part2.performances.length > 0) {
                    <div class="text-center my-6 py-2 border-y border-slate-300 dark:border-slate-700 font-sans text-xs tracking-wider uppercase text-slate-500">
                      {{ 'events.intermission' | transloco }}
                    </div>

                    <div>
                      <h3 class="text-sm font-sans font-bold uppercase tracking-widest text-center mb-4 text-brand-600">
                        {{ 'events.part2' | transloco }}
                      </h3>
                      <div class="space-y-4">
                        @for (item of p.part2.performances; track item.id) {
                          <div class="border-b border-dashed border-slate-200 dark:border-slate-800 pb-2">
                            <div class="flex justify-between items-baseline font-bold text-sm">
                              <span>{{ item.composer }}</span>
                              <span class="text-xs font-sans text-slate-500">{{ formatDuration(item.durationSeconds) }}</span>
                            </div>
                            <div class="text-xs italic">{{ item.pieceTitle }} @if (item.movement) { ({{ item.movement }}) }</div>
                            <div class="text-xs font-sans text-slate-600 dark:text-slate-400 mt-0.5">
                              {{ item.performerDisplayName }}
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  }
                }
              </div>
            }
          </div>
        </div>
      }

      <!-- Create Event Drawer -->
      <app-drawer
        [open]="isCreateOpen()"
        [title]="'events.createTitle' | transloco"
        (closed)="isCreateOpen.set(false)"
      >
        <form [formGroup]="createForm" (ngSubmit)="submitCreate()" class="space-y-4">
          <div>
            <label class="label">{{ 'events.eventTitle' | transloco }} *</label>
            <input type="text" formControlName="title" class="input" placeholder="π.χ. Χριστουγεννιάτικη Συναυλία Μαθητών" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">{{ 'events.eventType' | transloco }}</label>
              <select formControlName="eventType" class="input">
                <option value="CONCERT">{{ 'events.types.CONCERT' | transloco }}</option>
                <option value="RECITAL">{{ 'events.types.RECITAL' | transloco }}</option>
                <option value="MASTERCLASS">{{ 'events.types.MASTERCLASS' | transloco }}</option>
                <option value="AUDITION">{{ 'events.types.AUDITION' | transloco }}</option>
                <option value="WORKSHOP">{{ 'events.types.WORKSHOP' | transloco }}</option>
              </select>
            </div>

            <div>
              <label class="label">{{ 'events.branch' | transloco }}</label>
              <select formControlName="branchId" class="input">
                @for (b of branches(); track b.id) {
                  <option [value]="b.id">{{ b.name }}</option>
                }
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">{{ 'events.startsAt' | transloco }}</label>
              <input type="datetime-local" formControlName="startsAt" class="input" />
            </div>

            <div>
              <label class="label">{{ 'events.endsAt' | transloco }}</label>
              <input type="datetime-local" formControlName="endsAt" class="input" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">{{ 'events.maxCapacity' | transloco }}</label>
              <input type="number" formControlName="maxCapacity" class="input" />
            </div>

            <div>
              <label class="label">{{ 'events.intermissionMinutes' | transloco }}</label>
              <input type="number" formControlName="intermissionDurationMinutes" class="input" />
            </div>
          </div>

          <div>
            <label class="label">{{ 'events.description' | transloco }}</label>
            <textarea formControlName="description" class="input min-h-[80px]"></textarea>
          </div>

          <div class="flex justify-end gap-2 pt-4">
            <button type="button" class="btn btn-secondary" (click)="isCreateOpen.set(false)">
              {{ 'common.cancel' | transloco }}
            </button>
            <button type="submit" class="btn btn-primary" [disabled]="createForm.invalid || creating()">
              {{ 'common.save' | transloco }}
            </button>
          </div>
        </form>
      </app-drawer>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventsComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  readonly events = signal<EventItem[]>([]);
  readonly branches = signal<Branch[]>([]);
  readonly loading = signal(true);
  readonly searchTerm = signal('');
  readonly selectedType = signal('');
  readonly selectedBranch = signal('');

  readonly activeEvent = signal<EventItem | null>(null);
  readonly activeTab = signal<'stage' | 'checkin' | 'program'>('stage');
  readonly scanCode = signal('');
  readonly checkinResult = signal<any | null>(null);
  readonly checkingIn = signal(false);
  readonly programData = signal<any | null>(null);

  readonly isCreateOpen = signal(false);
  readonly creating = signal(false);
  readonly addingSlot = signal(false);

  readonly canWrite = computed(() => this.auth.has('events.write'));
  readonly canCurate = computed(() => this.auth.has('events.curate') || this.auth.has('events.write'));

  readonly upcomingCount = computed(() => {
    const now = new Date();
    return this.events().filter((e) => new Date(e.startsAt) >= now).length;
  });

  readonly totalPerformances = computed(() =>
    this.events().reduce((sum, e) => sum + (e._count?.performances || 0), 0),
  );

  readonly totalRegistrations = computed(() =>
    this.events().reduce((sum, e) => sum + (e._count?.registrations || 0), 0),
  );

  readonly filteredEvents = computed(() => {
    let list = this.events();
    const term = this.searchTerm().trim().toLowerCase();
    if (term) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(term) ||
          e.description?.toLowerCase().includes(term),
      );
    }
    const type = this.selectedType();
    if (type) {
      list = list.filter((e) => e.eventType === type);
    }
    const branch = this.selectedBranch();
    if (branch) {
      list = list.filter((e) => e.branchId === branch);
    }
    return list;
  });

  readonly createForm = this.fb.group({
    title: ['', Validators.required],
    eventType: ['CONCERT', Validators.required],
    branchId: ['', Validators.required],
    startsAt: ['', Validators.required],
    endsAt: ['', Validators.required],
    maxCapacity: [100, [Validators.required, Validators.min(1)]],
    intermissionDurationMinutes: [15, [Validators.required, Validators.min(0)]],
    description: [''],
  });

  readonly perfForm = this.fb.group({
    performerDisplayName: ['', Validators.required],
    composer: ['', Validators.required],
    pieceTitle: ['', Validators.required],
    movement: [''],
    durationSeconds: [240, [Validators.required, Validators.min(1)]],
    part: [1, Validators.required],
  });

  constructor() {
    this.loadBranches();
    this.loadEvents();
  }

  loadBranches() {
    this.api
      .get<{ items: Branch[] }>('/academics/branches')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.branches.set(res.items || []);
          if (res.items?.length && !this.createForm.value.branchId) {
            this.createForm.patchValue({ branchId: res.items[0].id });
          }
        },
      });
  }

  loadEvents() {
    this.loading.set(true);
    this.api
      .get<{ items: EventItem[] }>('/events')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.events.set(res.items || []);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.error(this.transloco.translate('common.loadFailed'));
        },
      });
  }

  updateSearch(val: string) {
    this.searchTerm.set(val);
  }

  openCreate() {
    const now = new Date();
    const start = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const end = new Date(start.getTime() + 2 * 3600 * 1000);

    this.createForm.patchValue({
      title: '',
      eventType: 'CONCERT',
      startsAt: start.toISOString().slice(0, 16),
      endsAt: end.toISOString().slice(0, 16),
      maxCapacity: 120,
      intermissionDurationMinutes: 15,
      description: '',
    });
    this.isCreateOpen.set(true);
  }

  submitCreate() {
    if (this.createForm.invalid) return;
    this.creating.set(true);
    const formVal = this.createForm.value;

    const payload = {
      ...formVal,
      startsAt: new Date(formVal.startsAt!).toISOString(),
      endsAt: new Date(formVal.endsAt!).toISOString(),
    };

    this.api
      .post<EventItem>('/events', payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.toast.success(this.transloco.translate('events.createSuccess'));
          this.events.update((list) => [created, ...list]);
          this.isCreateOpen.set(false);
          this.creating.set(false);
        },
        error: () => {
          this.toast.error(this.transloco.translate('common.saveFailed'));
          this.creating.set(false);
        },
      });
  }

  openDetail(id: string) {
    this.api
      .get<EventItem>(`/events/${id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ev) => {
          this.activeEvent.set(ev);
          this.activeTab.set('stage');
          this.checkinResult.set(null);
          this.scanCode.set('');
        },
      });
  }

  getPartPerformances(part: number): EventPerformance[] {
    const ev = this.activeEvent();
    if (!ev?.performances) return [];
    return ev.performances
      .filter((p) => p.part === part)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  calculatePartDuration(part: number): number {
    const list = this.getPartPerformances(part);
    const totalSecs = list.reduce((sum, p) => sum + p.durationSeconds, 0);
    return Math.ceil(totalSecs / 60);
  }

  movePerformance(perf: EventPerformance, direction: 'up' | 'down') {
    const ev = this.activeEvent();
    if (!ev) return;
    const items = this.getPartPerformances(perf.part);
    const currentIndex = items.findIndex((i) => i.id === perf.id);
    if (currentIndex < 0) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    // Swap order indices
    const other = items[targetIndex];
    const reorderedItems = [
      { performanceId: perf.id, part: perf.part, orderIndex: other.orderIndex },
      { performanceId: other.id, part: other.part, orderIndex: perf.orderIndex },
    ];

    this.api
      .put(`/events/${ev.id}/performances/reorder`, { reorderedItems })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.openDetail(ev.id);
          this.toast.success(this.transloco.translate('events.orderUpdated'));
        },
      });
  }

  submitPerformance() {
    const ev = this.activeEvent();
    if (!ev || this.perfForm.invalid) return;
    this.addingSlot.set(true);

    this.api
      .post<EventPerformance>(`/events/${ev.id}/performances`, this.perfForm.value)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.success(this.transloco.translate('events.slotAdded'));
          this.perfForm.reset({ durationSeconds: 240, part: 1 });
          this.openDetail(ev.id);
          this.addingSlot.set(false);
        },
        error: () => {
          this.toast.error(this.transloco.translate('common.saveFailed'));
          this.addingSlot.set(false);
        },
      });
  }

  removePerformance(performanceId: string) {
    const ev = this.activeEvent();
    if (!ev) return;

    this.confirm
      .confirm({
        title: this.transloco.translate('events.deleteSlotTitle'),
        message: this.transloco.translate('events.deleteSlotMessage'),
        confirmLabel: this.transloco.translate('common.delete'),
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api
          .delete(`/events/${ev.id}/performances/${performanceId}`)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.toast.success(this.transloco.translate('events.slotRemoved'));
              this.openDetail(ev.id);
            },
          });
      });
  }

  executeCheckin() {
    const ev = this.activeEvent();
    const code = this.scanCode().trim();
    if (!ev || !code) return;
    this.checkingIn.set(true);

    this.api
      .post(`/events/${ev.id}/checkin`, { ticketCode: code })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.checkinResult.set(res);
          this.scanCode.set('');
          this.checkingIn.set(false);
          this.toast.success(this.transloco.translate('events.admitSuccess'));
        },
        error: (err) => {
          this.checkingIn.set(false);
          this.toast.error(err.error?.message || this.transloco.translate('events.checkinFailed'));
        },
      });
  }

  loadProgram(eventId: string) {
    this.activeTab.set('program');
    this.api
      .get(`/events/${eventId}/program`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.programData.set(data),
      });
  }

  deleteEvent(e: EventItem) {
    this.confirm
      .confirm({
        title: this.transloco.translate('events.deleteTitle'),
        message: this.transloco.translate('events.deleteConfirm', { title: e.title }),
        confirmLabel: this.transloco.translate('common.delete'),
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.api
          .delete(`/events/${e.id}`)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => {
              this.toast.success(this.transloco.translate('events.deleteSuccess'));
              this.events.update((list) => list.filter((item) => item.id !== e.id));
            },
          });
      });
  }

  formatDate(val: string): string {
    const d = new Date(val);
    return d.toLocaleDateString('el-GR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  formatTime(val: string): string {
    const d = new Date(val);
    return d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getTypeBadgeClass(type: EventType): string {
    switch (type) {
      case 'CONCERT':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300';
      case 'RECITAL':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
      case 'MASTERCLASS':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
      case 'AUDITION':
        return 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'SCHEDULED':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300';
      case 'COMPLETED':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
      case 'CANCELLED':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300';
      default:
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
    }
  }
}
