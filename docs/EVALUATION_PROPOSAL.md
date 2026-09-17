# Proposal — a versatile student evaluation model

Drafted 2026-09-17. **Nothing here is built yet.** It needs your sign-off, and it involves new doctypes on the live site.

---

## The problem with what exists today

Two evaluation doctypes exist, and neither does the job.

| | `Student Evaluation` | `Student Hub Evaluation` |
|---|---|---|
| Rows | 0 | 8 |
| Subject (`class`) | ✓ Link to Course | ✗ **none** |
| Section | ✓ | ✗ |
| Rating criteria | 26, fixed columns | 19, fixed columns |
| Behaviour flags | ✓ 4 checkboxes | ✗ |
| Achievements / feedback text | ✓ | ✗ |
| Parent reply | ✗ | ✓ `status` + `parent_response` |

**Four things are wrong:**

1. **Criteria are table columns, not data.** Adding "perseverance" means a schema change. The school can never evolve its own framework without a developer.
2. **Every teacher gets every criterion.** A Maths teacher is asked to rate *reading fluency* and *hygiene*; a PE teacher is asked to rate *grammar and vocabulary*. So teachers either guess or skip, and the data becomes noise. This is the "versatile" problem you named.
3. **Unrated and zero are indistinguishable.** A Rating field defaults to 0. "I did not assess this" and "this is terrible" look identical, which quietly poisons any average.
4. **The two doctypes disagree.** The one with a subject has no parent channel; the one with a parent channel has no subject. You cannot both evaluate per-subject and show parents a single coherent picture.

---

## The proposed model

Move criteria out of columns and into a **catalogue**, and make each evaluation a **header plus a child table of ratings**. That single change fixes all four problems at once.

### Four new doctypes

**1. `Evaluation Category`** — the grouping layer
```
category_name        Data       e.g. "Learning behaviours"
description          Small Text
sort_order           Int
color                Data       for the app's charts
visible_to_parents   Check      some categories stay internal
```

**2. `Evaluation Criterion`** — the catalogue, the heart of it
```
criterion_name       Data       e.g. "Use of feedback"
category             Link       → Evaluation Category
description          Small Text what the teacher is judging
scale                Select     Stars 1-5 | Mastery 4-level | Frequency 4-level | Yes/No
applies_to           Select     All subjects | Specific subjects | Homeroom only | Specific grades
subjects             Table MultiSelect → Course
programs             Table MultiSelect → Program
guidance_low         Small Text what "1" looks like
guidance_high        Small Text what "5" looks like
is_active            Check
sort_order           Int
```
`applies_to` + `subjects` + `programs` is what makes it versatile: a PE teacher opening an evaluation sees motor skills, sportsmanship and participation — not grammar.

**3. `Evaluation Template`** — a named set for a context
```
template_name        Data       "Grade 4 Maths — termly"
evaluation_type      Select     Subject | Homeroom | Pastoral | End-of-term report
program / course     Link
criteria             Table      → Evaluation Template Criterion (criterion, required, sort_order)
```
Templates mean a teacher never assembles a form by hand, and the school can change the framework centrally each year.

**4. `Student Evaluation Entry`** — replaces both current doctypes
```
student              Link       → Student
student_group        Link
course               Link       optional — blank for a homeroom/pastoral entry
academic_year/term   Link       so evaluations are comparable across terms
evaluation_type      Select     Subject | Homeroom | Pastoral | End-of-term report
template             Link
reviewer             Link User  read-only, set server-side
review_date          Date
ratings              Table      → Student Evaluation Rating
strengths            Small Text
areas_to_improve     Small Text
next_steps           Small Text what the student/parent should DO
overall_comment      Text Editor
evidence             Attach     optional work sample
status               Select     Draft | Submitted | Shared with parents
parent_response      Small Text
parent_response_date Date
```

Child **`Student Evaluation Rating`**: `criterion`, `category` (fetched), `scale` (fetched), `score` Int, `not_assessed` Check, `comment` Small Text.

`not_assessed` is the fix for problem 4 — an explicit "didn't cover this", never conflated with a low score.

### More expressive scales

Stars are a blunt instrument for behaviour. Four scales, chosen per criterion:

| Scale | Levels | Best for |
|---|---|---|
| **Mastery** | Beginning · Developing · Secure · Exceeding | academic attainment — describes a standard, not a rank |
| **Frequency** | Rarely · Sometimes · Usually · Consistently | behaviours and habits — observable, not judgmental |
| **Stars** | 1–5 | quick holistic reads, familiar to parents |
| **Yes/No** | — | binary facts (brings materials, completes homework) |

### Proposed categories and criteria

Eight categories, ~45 criteria — versus today's flat 26.

1. **Subject mastery** *(subject-scoped)* — conceptual understanding, application of skills, recall & fluency, problem solving, practical/lab technique, subject vocabulary
2. **Literacy & communication** — reading fluency, reading comprehension, writing structure, grammar & vocabulary, speaking & presenting, listening
3. **Numeracy & reasoning** — number sense, mathematical reasoning, critical thinking, logical problem solving
4. **Learning behaviours** *(all subjects)* — engagement, participation, assignment responsibility, organization, independence, perseverance, acting on feedback
5. **Social & emotional** — peer relationships, respect, empathy, emotional regulation, conflict handling, teamwork, leadership
6. **Wellbeing & conduct** — punctuality, attendance, hygiene, materials & uniform, following rules, safety awareness
7. **Creativity & enterprise** — creativity, curiosity, initiative, digital literacy, artistic expression
8. **Physical development** *(PE-scoped)* — gross motor skills, fitness, sportsmanship, participation

Only 2–4 categories surface for any given teacher, driven by `applies_to`.

---

## What this unlocks — the insight layer

Today an evaluation is a dead record. With criteria as data and a category on every rating, the app can show:

- **Student profile** — a radar across the eight categories, and a trend line per category across terms.
- **Cross-subject signal** — is a student's weak *engagement* universal, or only in one subject? Today unanswerable; here it is one group-by. This is the single most useful thing the model buys.
- **Section heatmap** — criteria × students for a section, so a homeroom teacher sees at a glance that half the class is "Beginning" on organization.
- **Convergence alerts** — when 3+ teachers independently rate the same student low on the same criterion, flag the homeroom teacher. Cross-subject corroboration is far stronger evidence than one teacher's view.
- **Parent view** — categories marked `visible_to_parents`, with `strengths` / `areas_to_improve` / `next_steps` as the narrative.
- **Coverage reporting** — which criteria are actually being assessed, and which teachers have not evaluated this term.

---

## Migration

1. Create the four doctypes and seed the catalogue (~45 criteria, 8 categories) and ~6 starter templates.
2. Back-fill: each existing `Student Evaluation` / `Student Hub Evaluation` row maps column → criterion rating. 8 rows today, so this is trivial.
3. Point the app at `Student Evaluation Entry`; keep the old doctypes read-only for history.
4. Retire the old two once a term has run on the new model.

**Cost:** 4 doctypes + 2 child doctypes, a seed script, and the app form. The app form gets *simpler*, because it renders from the template instead of hard-coding 26 fields.

---

## Decisions needed before I build

1. **Do you want the catalogue model at all**, or should I extend `Student Hub Evaluation` in place with more columns? (Extending is cheaper now and costs more every year after.)
2. **Are the eight categories right** for Makko Billi, and is ~45 criteria the right size? I can cut to ~25 for a lighter first pass.
3. **Who maintains the catalogue** — Education Manager only, or System Manager?
4. **Should subject teachers be able to write a Homeroom/Pastoral entry**, or is that homeroom-only like late/sick?
5. **Parent visibility** — per category as proposed, or per whole evaluation?
