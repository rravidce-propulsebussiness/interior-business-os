'use client';

import { useState } from 'react';
import {
  CONCRETE_GRADES,
  CONCRETE_MEMBERS,
  mixRecipe,
  usedConcreteGrades,
  type ConcreteGrade,
  type ConcreteMix,
  type ConcreteMember,
  type MixRecipe,
  type StructuralSettings,
} from '@business-os/core/construction-boq';

type Props = {
  mix: ConcreteMix;
  onMixChange: (mix: ConcreteMix) => void;
  enabled: boolean;
  rateForGrade: (grade: ConcreteGrade) => number;
  onToggle: (enabled: boolean) => void;
  onRateChange: (grade: ConcreteGrade, rate: number) => void;
  settings: StructuralSettings;
  canEdit: boolean;
  canViewCost: boolean;
  autoSaveLabel?: string | undefined;
};
const figure = (amount: number) =>
  amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });

function GradeOptions() {
  return CONCRETE_GRADES.map((grade) => (
    <option key={grade} value={grade}>
      M{grade}
    </option>
  ));
}

function RecipeEditor({
  grade,
  recipe,
  onSave,
  disabled,
}: {
  grade: ConcreteGrade;
  recipe: MixRecipe | undefined;
  onSave: (recipe: MixRecipe) => void;
  disabled: boolean;
}) {
  const [cement, setCement] = useState(String(recipe?.cementBags ?? ''));
  const [sand, setSand] = useState(String(recipe?.sandCubicMetres ?? ''));
  const [aggregate, setAggregate] = useState(
    String(recipe?.aggregateCubicMetres ?? ''),
  );
  const [confirmed, setConfirmed] = useState(recipe?.confirmed ?? false);
  const valid =
    Number(cement) > 0 &&
    Number(cement) <= 30 &&
    Number(sand) > 0 &&
    Number(sand) <= 3 &&
    Number(aggregate) > 0 &&
    Number(aggregate) <= 3;
  return (
    <div className="boq-rmc-recipe-editor">
      <p>
        Enter the material quantities per cubic metre of finished concrete from
        the approved mix design.
      </p>
      <div className="boq-rmc-recipe-fields">
        <label>
          Cement (bags/m³)
          <input
            type="number"
            min="0"
            max="30"
            step="any"
            value={cement}
            disabled={disabled}
            onChange={(e) => {
              setCement(e.target.value);
              setConfirmed(false);
            }}
          />
        </label>
        <label>
          Sand (m³/m³)
          <input
            type="number"
            min="0"
            max="3"
            step="any"
            value={sand}
            disabled={disabled}
            onChange={(e) => {
              setSand(e.target.value);
              setConfirmed(false);
            }}
          />
        </label>
        <label>
          Aggregate (m³/m³)
          <input
            type="number"
            min="0"
            max="3"
            step="any"
            value={aggregate}
            disabled={disabled}
            onChange={(e) => {
              setAggregate(e.target.value);
              setConfirmed(false);
            }}
          />
        </label>
      </div>
      <label className="boq-rmc-confirm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={disabled}
          onChange={(e) => setConfirmed(e.target.checked)}
        />{' '}
        Confirmed against the engineer&apos;s approved mix design
      </label>
      <button
        className="boq-rmc-outline"
        type="button"
        disabled={disabled || !valid}
        onClick={() =>
          onSave({
            cementBags: Number(cement),
            sandCubicMetres: Number(sand),
            aggregateCubicMetres: Number(aggregate),
            confirmed,
          })
        }
      >
        Save M{grade} recipe
      </button>
    </div>
  );
}

export function BoqStructuralConcreteCard({
  enabled,
  mix,
  onMixChange,
  rateForGrade,
  onToggle,
  onRateChange,
  settings,
  canEdit,
  canViewCost,
  autoSaveLabel,
}: Props) {
  const editable = canEdit && canViewCost;
  const members = Object.keys(mix.overrides) as ConcreteMember[];
  const [expanded, setExpanded] = useState(members.length > 0);
  const grades = usedConcreteGrades(mix);
  const [editingGrade, setEditingGrade] = useState<ConcreteGrade | null>(null);
  return (
    <section
      className="boq-rmc-card"
      aria-labelledby="boq-rmc-heading"
      data-mode={enabled ? 'ready' : 'site'}
    >
      <div className="boq-rmc-top">
        <span className="boq-rmc-layers" aria-hidden="true">
          <svg
            viewBox="0 0 36 36"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinejoin="round"
          >
            <path d="M18 3 3 12l15 9 15-9-15-9Z" />
            <path d="m3 19 15 9 15-9M3 26l15 8 15-8" />
          </svg>
        </span>
        <div className="boq-rmc-heading">
          <h3 id="boq-rmc-heading">Structural Concrete Costing</h3>
          <p>Applies to all structural RCC</p>
        </div>
        <div
          className="boq-rmc-segment"
          role="group"
          aria-label="Structural concrete method"
        >
          <button
            type="button"
            aria-pressed={!enabled}
            onClick={() => onToggle(false)}
            disabled={!editable}
          >
            Site mix
          </button>
          <button
            type="button"
            aria-pressed={enabled}
            onClick={() => onToggle(true)}
            disabled={!editable}
          >
            Ready-mix (RMC)
          </button>
        </div>
      </div>

      <label className="boq-rmc-grade-row">
        <strong>Default concrete mix grade</strong>
        <select
          value={mix.defaultGrade}
          aria-label="Default concrete mix grade"
          disabled={!editable}
          onChange={(event) =>
            onMixChange({
              ...mix,
              defaultGrade: Number(event.target.value) as ConcreteGrade,
            })
          }
        >
          <GradeOptions />
        </select>
      </label>

      <div className="boq-rmc-overrides">
        <div className="boq-rmc-overrides-head">
          <strong>Member-specific grade overrides</strong>
          <button
            type="button"
            className="boq-rmc-outline"
            aria-expanded={expanded}
            onClick={() => setExpanded((old) => !old)}
          >
            {expanded ? 'Done' : '+ Add override'}
          </button>
        </div>
        {(expanded || members.length > 0) && (
          <div className="boq-rmc-overrides-grid">
            {CONCRETE_MEMBERS.filter(
              (member) => expanded || mix.overrides[member] !== undefined,
            ).map((member) => (
              <label key={member}>
                {member}
                <select
                  aria-label={member + ' concrete grade'}
                  value={mix.overrides[member] ?? ''}
                  disabled={!editable || !expanded}
                  onChange={(e) => {
                    const overrides = { ...mix.overrides };
                    if (e.target.value)
                      overrides[member] = Number(
                        e.target.value,
                      ) as ConcreteGrade;
                    else delete overrides[member];
                    onMixChange({ ...mix, overrides });
                  }}
                >
                  <option value="">Default (M{mix.defaultGrade})</option>
                  <GradeOptions />
                </select>
              </label>
            ))}
          </div>
        )}
      </div>

      {enabled ? (
        <div className="boq-rmc-site">
          <div className="boq-rmc-supply">
            <span className="boq-rmc-supply-symbol" aria-hidden="true">
              ▰
            </span>
            <span>
              <strong>Ready-mix concrete</strong>
              <small>Supply rate per cubic metre</small>
            </span>
          </div>
          {canViewCost && (
            <div className="boq-rmc-recipe">
              {grades.map((grade) => (
                <label className="boq-rmc-grade-rate" key={grade}>
                  <span>M{grade} RMC · ₹/m³</span>
                  <input
                    type="number"
                    min={0}
                    max={10000000}
                    step="any"
                    value={rateForGrade(grade)}
                    aria-label={`RMC M${grade} rate per cubic metre`}
                    disabled={!editable}
                    onChange={(e) =>
                      onRateChange(
                        grade,
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </label>
              ))}
            </div>
          )}
          <p className="boq-rmc-note">
            Cement, sand and aggregate for structural RCC are included in RMC.
            PCC, sajjas, shelves, brickwork and plaster remain separate.
          </p>
        </div>
      ) : (
        grades.map((grade) => {
          const recipe = mixRecipe(mix, grade);
          return (
            <div className="boq-rmc-site" key={grade}>
              <div className="boq-rmc-estimate-head">
                <div className="boq-rmc-supply">
                  <span className="boq-rmc-supply-symbol" aria-hidden="true">
                    <svg
                      viewBox="0 0 40 36"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 23h20V10h7l5 10v7H5zM25 19h11M14 8l9 5-4 11H7L3 15l5-8zM12 8l-4 7 7 9M6 28h11M23 28h5" />
                      <circle cx="12" cy="29" r="3" fill="#fce0c9" />
                      <circle cx="32" cy="29" r="3" fill="#fce0c9" />
                    </svg>
                  </span>
                  <span>
                    <strong>Site-mix material estimate</strong>
                    <small>Per m³ · M{grade}</small>
                  </span>
                </div>
                <button
                  type="button"
                  disabled={!editable}
                  aria-expanded={editingGrade === grade}
                  onClick={() =>
                    setEditingGrade(editingGrade === grade ? null : grade)
                  }
                  className={`boq-rmc-badge ${recipe?.confirmed ? 'confirmed' : ''}`}
                >
                  {recipe?.confirmed
                    ? '✓ Mix confirmed'
                    : '⚠ Verify mix design'}
                </button>
              </div>
              {recipe ? (
                <div
                  className="boq-rmc-recipe"
                  aria-label={`M${grade} site-mix quantities per cubic metre`}
                >
                  <div>
                    <span>Cement</span>
                    <strong>{figure(recipe.cementBags)} bags/m³</strong>
                  </div>
                  <div>
                    <span>Sand</span>
                    <strong>
                      {figure(recipe.sandCubicMetres * settings.sandTonPerCum)}{' '}
                      t/m³
                    </strong>
                  </div>
                  <div>
                    <span>20 mm Aggregate</span>
                    <strong>
                      {figure(
                        recipe.aggregateCubicMetres *
                          settings.aggregateTonPerCum,
                      )}{' '}
                      t/m³
                    </strong>
                  </div>
                </div>
              ) : (
                <p className="boq-rmc-warning">
                  No mix recipe specified. M{grade} quantities remain unpriced
                  until a recipe is entered.
                </p>
              )}
              {(editingGrade === grade || !recipe) && (
                <RecipeEditor
                  key={`${grade}:${JSON.stringify(recipe)}`}
                  grade={grade}
                  recipe={recipe}
                  disabled={!editable}
                  onSave={(next) => {
                    onMixChange({
                      ...mix,
                      recipes: { ...mix.recipes, [grade]: next },
                    });
                    setEditingGrade(null);
                  }}
                />
              )}
            </div>
          );
        })
      )}
      {autoSaveLabel && (
        <span className="boq-rmc-autosave" role="status">
          {autoSaveLabel}
        </span>
      )}
    </section>
  );
}
