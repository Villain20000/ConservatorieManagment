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
  Lead,
  LeadActivity,
  LeadActivityType,
  LeadSource,
  LeadStage,
  Level,
  Program,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { SHARED_IMPORTS } from '../../shared/shared.imports';

interface StageMeta {
  key: LeadStage;
  labelKey: string;
  badgeClass: string;
  borderClass: string;
}

const STAGES: StageMeta[] = [
  { key: 'NEW', labelKey: 'crm.stages.NEW', badgeClass: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300', borderClass: 'border-blue-500' },
  { key: 'CONTACTED', labelKey: 'crm.stages.CONTACTED', badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300', borderClass: 'border-amber-500' },
  { key: 'TRIAL_BOOKED', labelKey: 'crm.stages.TRIAL_BOOKED', badgeClass: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300', borderClass: 'border-purple-500' },
  { key: 'TRIAL_COMPLETED', labelKey: 'crm.stages.TRIAL_COMPLETED', badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300', borderClass: 'border-indigo-500' },
  { key: 'OFFER_SENT', labelKey: 'crm.stages.OFFER_SENT', badgeClass: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300', borderClass: 'border-yellow-500' },
  { key: 'ENROLLED', labelKey: 'crm.stages.ENROLLED', badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', borderClass: 'border-emerald-500' },
  { key: 'LOST', labelKey: 'crm.stages.LOST', badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400', borderClass: 'border-slate-400' },
];

@Component({
  selector: 'app-crm-page',
  imports: [...SHARED_IMPORTS, ReactiveFormsModule],
  template: `
    <div class="page">
      <app-page-header title="crm.title" subtitle="crm.subtitle">
        @if (canWrite()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()">
            <app-icon name="plus" [size]="16" />
            {{ 'crm.newLead' | transloco }}
          </button>
        }
      </app-page-header>

      <!-- Filter Bar -->
      <div class="card card-pad mb-5">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="relative sm:col-span-2 lg:col-span-2">
            <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
              <app-icon name="search" [size]="15" />
            </span>
            <input
              name="search"
              type="search"
              class="input pl-9"
              [value]="search()"
              [placeholder]="'crm.searchPlaceholder' | transloco"
              (input)="onSearchInput($event)"
              autocomplete="off"
            />
          </div>

          <select
            name="branchFilter"
            class="select"
            [value]="branchFilter()"
            (change)="onBranchFilterChange($event)"
            [attr.aria-label]="'common.allBranches' | transloco"
          >
            <option value="">{{ 'common.allBranches' | transloco }}</option>
            @for (branch of options()?.branches ?? []; track branch.id) {
              <option [value]="branch.id">{{ branch.name }}</option>
            }
          </select>

          <select
            name="programFilter"
            class="select"
            [value]="programFilter()"
            (change)="onProgramFilterChange($event)"
            [attr.aria-label]="'common.allPrograms' | transloco"
          >
            <option value="">{{ 'common.allPrograms' | transloco }}</option>
            @for (program of options()?.programs ?? []; track program.id) {
              <option [value]="program.id">{{ program.name }}</option>
            }
          </select>
        </div>
      </div>

      <!-- Kanban Pipeline Board -->
      <div class="flex gap-4 overflow-x-auto pb-6">
        @for (stage of stages; track stage.key) {
          <div class="w-80 shrink-0 flex flex-col rounded-xl bg-surface-alt/50 border border-border p-3">
            <!-- Stage Header -->
            <div class="flex items-center justify-between pb-3 border-b border-border mb-3">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full" [ngClass]="stage.borderClass.replace('border-', 'bg-')"></span>
                <span class="font-medium text-sm text-ink">{{ stage.labelKey | transloco }}</span>
              </div>
              <span class="px-2 py-0.5 rounded-full text-xs font-semibold" [ngClass]="stage.badgeClass">
                {{ (leadsByStage()[stage.key] || []).length }}
              </span>
            </div>

            <!-- Leads Cards List -->
            <div class="flex flex-col gap-3 min-h-[300px]">
              @for (lead of leadsByStage()[stage.key] || []; track lead.id) {
                <div
                  class="card card-pad bg-surface border-border shadow-xs hover:shadow-md transition-shadow cursor-pointer select-none"
                  (click)="openDetail(lead)"
                >
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <h4 class="font-semibold text-sm text-ink">
                      {{ lead.studentFirstName }} {{ lead.studentLastName }}
                    </h4>
                    @if (lead.program) {
                      <span
                        class="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        [style.backgroundColor]="(lead.program.color || '#6366f1') + '22'"
                        [style.color]="lead.program.color || '#6366f1'"
                      >
                        {{ lead.program.name }}
                      </span>
                    }
                  </div>

                  <div class="text-xs text-ink-2 space-y-1 mb-3">
                    <div class="flex items-center gap-1.5">
                      <app-icon name="user" [size]="12" class="text-ink-3" />
                      <span>{{ lead.contactName }} @if (lead.relationship) { ({{ lead.relationship }}) }</span>
                    </div>
                    @if (lead.contactPhone) {
                      <div class="flex items-center gap-1.5">
                        <app-icon name="phone" [size]="12" class="text-ink-3" />
                        <span>{{ lead.contactPhone }}</span>
                      </div>
                    }
                    @if (lead.nextFollowUpAt) {
                      <div class="flex items-center gap-1.5 text-xs font-medium" [ngClass]="followUpTone(lead.nextFollowUpAt)">
                        <app-icon name="clock" [size]="12" />
                        <span>{{ formatFollowUp(lead.nextFollowUpAt) }}</span>
                      </div>
                    }
                  </div>

                  <!-- Quick Stage Actions -->
                  <div class="flex items-center justify-between pt-2 border-t border-border text-xs" (click)="$event.stopPropagation()">
                    <span class="text-ink-3 flex items-center gap-1">
                      <app-icon name="activity" [size]="12" />
                      {{ lead.activities?.length ?? 0 }}
                    </span>

                    <div class="flex items-center gap-1">
                      @if (lead.stage !== 'ENROLLED' && canWrite()) {
                        <button
                          type="button"
                          class="btn btn-xs btn-outline text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50"
                          (click)="openConvert(lead)"
                          title="{{ 'crm.convertToStudent' | transloco }}"
                        >
                          <app-icon name="user-check" [size]="12" />
                          {{ 'crm.convertToStudent' | transloco }}
                        </button>
                      }

                      <div class="relative group">
                        <button type="button" class="btn btn-xs btn-ghost px-1.5" title="Αλλαγή σταδίου">
                          <app-icon name="more" [size]="12" />
                        </button>
                        <div class="absolute right-0 bottom-full mb-1 hidden group-hover:flex flex-col bg-surface border border-border shadow-lg rounded-lg py-1 min-w-[140px] z-20">
                          @for (targetStage of stages; track targetStage.key) {
                            @if (targetStage.key !== lead.stage) {
                              <button
                                type="button"
                                class="px-3 py-1 text-left text-xs text-ink hover:bg-surface-alt transition-colors"
                                (click)="quickChangeStage(lead, targetStage.key)"
                              >
                                {{ targetStage.labelKey | transloco }}
                              </button>
                            }
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              } @empty {
                <div class="h-28 rounded-lg border border-dashed border-border/70 flex items-center justify-center text-xs text-ink-3">
                  {{ 'crm.noLeads' | transloco }}
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Create Lead Drawer -->
      <app-drawer
        [open]="createDrawerOpen()"
        [title]="'crm.newLead' | transloco"
        (closed)="createDrawerOpen.set(false)"
      >
        <form [formGroup]="createForm" (ngSubmit)="saveCreate()" class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">{{ 'common.firstName' | transloco }} *</label>
              <input type="text" formControlName="studentFirstName" class="input" />
            </div>
            <div>
              <label class="label">{{ 'common.lastName' | transloco }} *</label>
              <input type="text" formControlName="studentLastName" class="input" />
            </div>
          </div>

          <div>
            <label class="label">{{ 'crm.contact' | transloco }} (Ονοματεπώνυμο υπευθύνου) *</label>
            <input type="text" formControlName="contactName" class="input" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">{{ 'common.phone' | transloco }}</label>
              <input type="tel" formControlName="contactPhone" class="input" />
            </div>
            <div>
              <label class="label">{{ 'common.email' | transloco }}</label>
              <input type="email" formControlName="contactEmail" class="input" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Σχέση με υποψήφιο</label>
              <input type="text" formControlName="relationship" class="input" placeholder="π.χ. Μητέρα, Πατέρας, Ίδιος" />
            </div>
            <div>
              <label class="label">Ημερομηνία γέννησης</label>
              <input type="date" formControlName="birthDate" class="input" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Παράρτημα *</label>
              <select formControlName="branchId" class="select">
                <option value="">Επιλέξτε παράρτημα</option>
                @for (branch of options()?.branches ?? []; track branch.id) {
                  <option [value]="branch.id">{{ branch.name }}</option>
                }
              </select>
            </div>
            <div>
              <label class="label">Πρόγραμμα σπουδών</label>
              <select formControlName="programId" class="select">
                <option value="">Επιλέξτε πρόγραμμα</option>
                @for (program of options()?.programs ?? []; track program.id) {
                  <option [value]="program.id">{{ program.name }}</option>
                }
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Πηγή προσέλευσης</label>
              <select formControlName="source" class="select">
                <option value="WEB_FORM">Ιστοσελίδα</option>
                <option value="PHONE">Τηλέφωνο</option>
                <option value="WALK_IN">Προσέλευση</option>
                <option value="REFERRAL">Σύσταση</option>
                <option value="CAMPAIGN">Καμπάνια</option>
                <option value="SOCIAL">Social Media</option>
                <option value="OTHER">Άλλο</option>
              </select>
            </div>
            <div>
              <label class="label">{{ 'crm.nextFollowUp' | transloco }}</label>
              <input type="datetime-local" formControlName="nextFollowUpAt" class="input" />
            </div>
          </div>

          <div>
            <label class="label">Σημειώσεις</label>
            <textarea formControlName="notes" rows="3" class="input"></textarea>
          </div>

          <div class="flex justify-end gap-2 pt-4 border-t border-border">
            <button type="button" class="btn btn-outline" (click)="createDrawerOpen.set(false)">
              {{ 'common.cancel' | transloco }}
            </button>
            <button type="submit" class="btn btn-primary" [disabled]="createForm.invalid || saving()">
              {{ 'common.save' | transloco }}
            </button>
          </div>
        </form>
      </app-drawer>

      <!-- Lead Detail & Activities Drawer -->
      <app-drawer
        [open]="detailDrawerOpen()"
        [title]="selectedLead() ? (selectedLead()!.studentFirstName + ' ' + selectedLead()!.studentLastName) : ''"
        (closed)="detailDrawerOpen.set(false)"
      >
        @if (selectedLead(); as lead) {
          <div class="space-y-6">
            <!-- Lead Summary Header -->
            <div class="card card-pad bg-surface-alt/40 border-border">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="text-xs text-ink-3 uppercase font-semibold">Υπεύθυνος Επικοινωνίας</div>
                  <div class="text-sm font-medium text-ink mt-0.5">
                    {{ lead.contactName }} @if (lead.relationship) { ({{ lead.relationship }}) }
                  </div>
                  <div class="text-xs text-ink-2 mt-1 space-y-0.5">
                    @if (lead.contactPhone) { <div>Τηλ: {{ lead.contactPhone }}</div> }
                    @if (lead.contactEmail) { <div>Email: {{ lead.contactEmail }}</div> }
                  </div>
                </div>
                <div class="flex flex-col items-end gap-2">
                  <span class="px-2.5 py-1 rounded-full text-xs font-semibold" [ngClass]="stageMeta(lead.stage).badgeClass">
                    {{ stageMeta(lead.stage).labelKey | transloco }}
                  </span>
                  @if (lead.stage !== 'ENROLLED' && canWrite()) {
                    <button type="button" class="btn btn-xs btn-primary" (click)="openConvert(lead)">
                      <app-icon name="user-check" [size]="14" />
                      {{ 'crm.convertToStudent' | transloco }}
                    </button>
                  }
                </div>
              </div>

              @if (lead.notes) {
                <div class="mt-3 pt-3 border-t border-border text-xs text-ink-2">
                  <span class="font-medium text-ink">Σημειώσεις:</span> {{ lead.notes }}
                </div>
              }
            </div>

            <!-- Add Activity Form -->
            @if (canWrite()) {
              <div class="card card-pad border-border">
                <h5 class="text-xs font-semibold text-ink uppercase mb-3">Νέα Ενέργεια / Επικοινωνία</h5>
                <form [formGroup]="activityForm" (ngSubmit)="saveActivity()" class="space-y-3">
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="label">Τύπος</label>
                      <select formControlName="type" class="select text-xs">
                        <option value="NOTE">Σημείωση</option>
                        <option value="CALL">Τηλεφώνημα</option>
                        <option value="EMAIL">Email</option>
                        <option value="MEETING">Συνάντηση</option>
                        <option value="TRIAL_SCHEDULED">Δοκιμαστικό μάθημα</option>
                        <option value="FOLLOW_UP">Follow-up</option>
                      </select>
                    </div>
                    <div>
                      <label class="label">Αλλαγή σταδίου (προαιρετικά)</label>
                      <select formControlName="toStage" class="select text-xs">
                        <option value="">Χωρίς αλλαγή</option>
                        @for (stage of stages; track stage.key) {
                          <option [value]="stage.key">{{ stage.labelKey | transloco }}</option>
                        }
                      </select>
                    </div>
                  </div>

                  <div>
                    <label class="label">Περιεχόμενο / Σχόλια</label>
                    <textarea formControlName="body" rows="2" class="input text-xs" placeholder="Καταγράψτε την έκβαση της επικοινωνίας..."></textarea>
                  </div>

                  <div class="flex justify-end">
                    <button type="submit" class="btn btn-xs btn-primary" [disabled]="activityForm.invalid || saving()">
                      {{ 'crm.addActivity' | transloco }}
                    </button>
                  </div>
                </form>
              </div>
            }

            <!-- Activity History Timeline -->
            <div>
              <h5 class="text-xs font-semibold text-ink uppercase mb-3">{{ 'crm.timeline' | transloco }}</h5>
              <div class="space-y-3">
                @for (activity of selectedLeadDetails()?.activities ?? []; track activity.id) {
                  <div class="flex gap-3 text-xs">
                    <div class="w-7 h-7 rounded-full bg-surface-alt border border-border flex items-center justify-center shrink-0 text-ink-2">
                      <app-icon [name]="activityIcon(activity.type)" [size]="13" />
                    </div>
                    <div class="flex-1 bg-surface-alt/30 border border-border rounded-lg p-2.5">
                      <div class="flex items-center justify-between text-ink-3 text-[11px] mb-1">
                        <span class="font-medium text-ink">{{ activityTypeLabel(activity.type) }}</span>
                        <span>{{ formatDateTime(activity.createdAt) }}</span>
                      </div>
                      @if (activity.body) {
                        <p class="text-ink-2 leading-relaxed">{{ activity.body }}</p>
                      }
                      @if (activity.fromStage && activity.toStage) {
                        <div class="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3">
                          <span>{{ stageLabel(activity.fromStage) }}</span>
                          <app-icon name="arrow-right" [size]="10" />
                          <span class="font-medium text-ink">{{ stageLabel(activity.toStage) }}</span>
                        </div>
                      }
                    </div>
                  </div>
                } @empty {
                  <p class="text-xs text-ink-3 italic">Δεν υπάρχουν ακόμη καταγεγραμμένες ενέργειες.</p>
                }
              </div>
            </div>

            <!-- Delete Lead Action -->
            @if (canWrite()) {
              <div class="pt-4 border-t border-border flex justify-end">
                <button type="button" class="btn btn-xs btn-outline text-red-600 hover:bg-red-50" (click)="deleteLead(lead)">
                  <app-icon name="trash" [size]="13" />
                  Διαγραφή υποψηφίου
                </button>
              </div>
            }
          </div>
        }
      </app-drawer>

      <!-- Convert to Student Modal -->
      @if (convertModalOpen() && selectedLead()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div class="card card-pad max-w-lg w-full bg-surface shadow-2xl rounded-2xl border border-border">
            <div class="flex items-center justify-between pb-3 border-b border-border mb-4">
              <h3 class="font-bold text-base text-ink flex items-center gap-2">
                <app-icon name="user-check" [size]="18" class="text-emerald-600" />
                {{ 'crm.convertToStudent' | transloco }}
              </h3>
              <button type="button" class="btn btn-xs btn-ghost" (click)="convertModalOpen.set(false)">
                <app-icon name="x" [size]="16" />
              </button>
            </div>

            <p class="text-xs text-ink-2 mb-4 leading-relaxed">
              Μετατρέψτε τον υποψήφιο <strong>{{ selectedLead()!.studentFirstName }} {{ selectedLead()!.studentLastName }}</strong>
              σε επίσημο μαθητή του ωδείου. Θα δημιουργηθεί αυτόματα καρτέλα μαθητή, καρτέλα κηδεμόνα και ακαδημαϊκή εγγραφή.
            </p>

            <form [formGroup]="convertForm" (ngSubmit)="saveConvert()" class="space-y-3.5">
              <div>
                <label class="label">Πρόγραμμα σπουδών *</label>
                <select formControlName="programId" class="select" (change)="onConvertProgramChange()">
                  <option value="">Επιλέξτε πρόγραμμα</option>
                  @for (program of options()?.programs ?? []; track program.id) {
                    <option [value]="program.id">{{ program.name }}</option>
                  }
                </select>
              </div>

              <div>
                <label class="label">Επίπεδο σπουδών</label>
                <select formControlName="levelId" class="select">
                  <option value="">Αυτόματο (Προκαταρκτική / Αρχικό)</option>
                  @for (level of availableLevels(); track level.id) {
                    <option [value]="level.id">{{ level.name }}</option>
                  }
                </select>
              </div>

              <div>
                <label class="label">Παράρτημα εγγραφής</label>
                <select formControlName="branchId" class="select">
                  @for (branch of options()?.branches ?? []; track branch.id) {
                    <option [value]="branch.id">{{ branch.name }}</option>
                  }
                </select>
              </div>

              <div class="flex items-center gap-2 pt-2">
                <input type="checkbox" id="consentData" formControlName="consentData" class="checkbox" />
                <label for="consentData" class="text-xs text-ink cursor-pointer">
                  Συγκατάθεση επεξεργασίας προσωπικών δεδομένων (GDPR)
                </label>
              </div>

              <div class="flex items-center gap-2">
                <input type="checkbox" id="consentMedia" formControlName="consentMedia" class="checkbox" />
                <label for="consentMedia" class="text-xs text-ink cursor-pointer">
                  Συγκατάθεση φωτογράφισης / βιντεοσκόπησης σε εκδηλώσεις
                </label>
              </div>

              <div class="flex justify-end gap-2 pt-4 border-t border-border mt-4">
                <button type="button" class="btn btn-outline" (click)="convertModalOpen.set(false)">
                  {{ 'common.cancel' | transloco }}
                </button>
                <button type="submit" class="btn btn-primary bg-emerald-600 hover:bg-emerald-700 text-white" [disabled]="convertForm.invalid || saving()">
                  <app-icon name="check" [size]="16" />
                  Ολοκλήρωση Εγγραφής
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrmPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly stages = STAGES;
  readonly leads = signal<Lead[]>([]);
  readonly options = signal<AcademicsOptions | null>(null);
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);

  // Filters
  readonly search = signal<string>('');
  readonly branchFilter = signal<string>('');
  readonly programFilter = signal<string>('');

  // Drawers & Modals
  readonly createDrawerOpen = signal<boolean>(false);
  readonly detailDrawerOpen = signal<boolean>(false);
  readonly convertModalOpen = signal<boolean>(false);
  readonly selectedLead = signal<Lead | null>(null);
  readonly selectedLeadDetails = signal<Lead | null>(null);

  readonly canWrite = computed(() => this.auth.has('crm.write'));

  // Reactive Forms
  readonly createForm = this.fb.nonNullable.group({
    studentFirstName: ['', [Validators.required, Validators.maxLength(80)]],
    studentLastName: ['', [Validators.required, Validators.maxLength(80)]],
    contactName: ['', [Validators.required, Validators.maxLength(120)]],
    contactPhone: [''],
    contactEmail: ['', [Validators.email]],
    relationship: [''],
    birthDate: [''],
    branchId: ['', [Validators.required]],
    programId: [''],
    source: ['WEB_FORM' as LeadSource],
    nextFollowUpAt: [''],
    notes: [''],
  });

  readonly activityForm = this.fb.nonNullable.group({
    type: ['NOTE' as LeadActivityType, [Validators.required]],
    toStage: ['' as LeadStage | ''],
    body: ['', [Validators.required]],
  });

  readonly convertForm = this.fb.nonNullable.group({
    programId: ['', [Validators.required]],
    levelId: [''],
    branchId: [''],
    consentData: [true],
    consentMedia: [false],
  });

  readonly leadsByStage = computed(() => {
    const term = this.search().toLowerCase().trim();
    const branch = this.branchFilter();
    const program = this.programFilter();

    const grouped: Record<LeadStage, Lead[]> = {
      NEW: [],
      CONTACTED: [],
      TRIAL_BOOKED: [],
      TRIAL_COMPLETED: [],
      OFFER_SENT: [],
      ENROLLED: [],
      LOST: [],
    };

    for (const lead of this.leads()) {
      if (branch && lead.branchId !== branch) continue;
      if (program && lead.programId !== program) continue;
      if (term) {
        const fullName = `${lead.studentFirstName} ${lead.studentLastName}`.toLowerCase();
        const contact = (lead.contactName || '').toLowerCase();
        const phone = (lead.contactPhone || '').toLowerCase();
        const email = (lead.contactEmail || '').toLowerCase();
        if (
          !fullName.includes(term) &&
          !contact.includes(term) &&
          !phone.includes(term) &&
          !email.includes(term)
        ) {
          continue;
        }
      }

      if (grouped[lead.stage]) {
        grouped[lead.stage].push(lead);
      }
    }

    return grouped;
  });

  readonly availableLevels = computed(() => {
    return this.options()?.levels ?? [];
  });

  constructor() {
    this.loadOptions();
    this.loadLeads();
  }

  loadOptions() {
    this.api
      .get<AcademicsOptions>('/academics/options')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.options.set(res),
        error: () => {},
      });
  }

  loadLeads() {
    this.loading.set(true);
    this.api
      .list<Lead>('/crm/leads', { pageSize: 300 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.leads.set(res.data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onSearchInput(event: Event) {
    this.search.set((event.target as HTMLInputElement).value);
  }

  onBranchFilterChange(event: Event) {
    this.branchFilter.set((event.target as HTMLSelectElement).value);
  }

  onProgramFilterChange(event: Event) {
    this.programFilter.set((event.target as HTMLSelectElement).value);
  }

  openCreate() {
    this.createForm.reset({
      source: 'WEB_FORM',
      branchId: this.options()?.branches?.[0]?.id || '',
    });
    this.createDrawerOpen.set(true);
  }

  saveCreate() {
    if (this.createForm.invalid) return;
    this.saving.set(true);
    const val = this.createForm.getRawValue();

    this.api
      .post<Lead>('/crm/leads', val)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.saving.set(false);
          this.createDrawerOpen.set(false);
          this.toast.success('crm.createdSuccess');
          this.leads.update((list) => [created, ...list]);
        },
        error: () => this.saving.set(false),
      });
  }

  openDetail(lead: Lead) {
    this.selectedLead.set(lead);
    this.detailDrawerOpen.set(true);
    this.api
      .get<Lead>(`/crm/leads/${lead.id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fullLead) => {
          this.selectedLeadDetails.set(fullLead);
        },
      });
  }

  quickChangeStage(lead: Lead, toStage: LeadStage) {
    this.api
      .patch<Lead>(`/crm/leads/${lead.id}/stage`, { stage: toStage })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.leads.update((list) => list.map((l) => (l.id === lead.id ? { ...l, stage: toStage } : l)));
          if (this.selectedLead()?.id === lead.id) {
            this.selectedLead.update((l) => (l ? { ...l, stage: toStage } : null));
          }
          this.toast.success('crm.updatedSuccess');
        },
      });
  }

  saveActivity() {
    const lead = this.selectedLead();
    if (!lead || this.activityForm.invalid) return;
    this.saving.set(true);
    const val = this.activityForm.getRawValue();

    this.api
      .post<LeadActivity>(`/crm/leads/${lead.id}/activities`, val)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (act) => {
          this.saving.set(false);
          this.activityForm.reset({ type: 'NOTE', toStage: '', body: '' });
          this.toast.success('crm.activityAdded');
          if (val.toStage) {
            this.quickChangeStage(lead, val.toStage as LeadStage);
          }
          this.openDetail(lead);
        },
        error: () => this.saving.set(false),
      });
  }

  openConvert(lead: Lead) {
    this.selectedLead.set(lead);
    this.convertForm.reset({
      programId: lead.programId || '',
      levelId: '',
      branchId: lead.branchId,
      consentData: true,
      consentMedia: false,
    });
    this.convertModalOpen.set(true);
  }

  onConvertProgramChange() {
    this.convertForm.patchValue({ levelId: '' });
  }

  saveConvert() {
    const lead = this.selectedLead();
    if (!lead || this.convertForm.invalid) return;
    this.saving.set(true);
    const val = this.convertForm.getRawValue();

    this.api
      .post<{ student: unknown; enrollment: unknown; lead: Lead }>(`/crm/leads/${lead.id}/convert`, val)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.convertModalOpen.set(false);
          this.detailDrawerOpen.set(false);
          this.toast.success('crm.convertSuccess');
          this.leads.update((list) =>
            list.map((l) => (l.id === lead.id ? { ...l, stage: 'ENROLLED' as LeadStage } : l)),
          );
        },
        error: () => this.saving.set(false),
      });
  }

  async deleteLead(lead: Lead) {
    const ok = await this.confirm.confirm({
      title: 'Διαγραφή υποψηφίου',
      message: 'crm.confirmDelete',
      confirmLabel: 'common.delete',
      danger: true,
    });
    if (!ok) return;

    this.api
      .delete(`/crm/leads/${lead.id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.detailDrawerOpen.set(false);
          this.leads.update((list) => list.filter((l) => l.id !== lead.id));
          this.toast.success('common.save');
        },
      });
  }

  stageMeta(stage: LeadStage): StageMeta {
    return STAGES.find((s) => s.key === stage) || STAGES[0];
  }

  stageLabel(stage: LeadStage): string {
    return this.stageMeta(stage).labelKey;
  }

  activityTypeLabel(type: LeadActivityType): string {
    const map: Record<LeadActivityType, string> = {
      NOTE: 'Σημείωση',
      CALL: 'Τηλεφώνημα',
      EMAIL: 'Email',
      MEETING: 'Συνάντηση',
      STAGE_CHANGE: 'Αλλαγή σταδίου',
      TRIAL_SCHEDULED: 'Δοκιμαστικό μάθημα',
      FOLLOW_UP: 'Follow-up',
      CONVERSION: 'Εγγραφή / Μετατροπή',
    };
    return map[type] || type;
  }

  activityIcon(type: LeadActivityType): string {
    const map: Record<LeadActivityType, string> = {
      NOTE: 'pencil',
      CALL: 'phone',
      EMAIL: 'mail',
      MEETING: 'users',
      STAGE_CHANGE: 'arrow-right',
      TRIAL_SCHEDULED: 'calendar',
      FOLLOW_UP: 'clock',
      CONVERSION: 'badge-check',
    };
    return map[type] || 'activity';
  }

  followUpTone(dateStr: string): string {
    const dt = new Date(dateStr).getTime();
    const now = Date.now();
    if (dt < now) return 'text-red-600 dark:text-red-400 font-semibold';
    if (dt - now < 24 * 60 * 60 * 1000) return 'text-amber-600 dark:text-amber-400 font-semibold';
    return 'text-ink-3';
  }

  formatFollowUp(dateStr: string): string {
    const d = new Date(dateStr);
    return `Follow-up: ${d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}`;
  }

  formatDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}`;
  }
}
