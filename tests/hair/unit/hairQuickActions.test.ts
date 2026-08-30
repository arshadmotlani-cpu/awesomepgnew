/**
 * Quick Actions menu and shared New Expense entry points.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('Quick Actions contains Express Sale, Advance Payment, and Add Expense', () => {
  const src = readFileSync(
    join(root, 'src/hair/components/HairQuickActionsMenu.tsx'),
    'utf8',
  );
  assert.match(src, /Express Sale/);
  assert.match(src, /Advance Payment/);
  assert.match(src, /Add Expense/);
  assert.match(src, /Record a new business expense/);
});

test('Add Expense opens NewExpenseModal directly without expenses route navigation', () => {
  const src = readFileSync(
    join(root, 'src/hair/components/HairQuickActionsMenu.tsx'),
    'utf8',
  );
  assert.match(src, /NewExpenseModal/);
  assert.match(src, /setExpenseModalOpen\(true\)/);
  assert.doesNotMatch(src, /href:\s*['"]\/expenses['"]/);
  assert.doesNotMatch(src, /router\.push\(['"]\/expenses/);
});

test('Expenses dashboard Add expense opens canonical NewExpenseModal', () => {
  const expensesUi = readFileSync(
    join(root, 'src/hair/components/expenses/ExpensesUi.tsx'),
    'utf8',
  );
  assert.match(expensesUi, /NewExpenseModal/);
  assert.match(expensesUi, /setModalOpen\(true\)/);
  assert.doesNotMatch(expensesUi, /href="#add-expense"/);
});

test('NewExpenseModal and Expenses dashboard share ExpenseForm', () => {
  const modal = readFileSync(
    join(root, 'src/hair/components/expenses/NewExpenseModal.tsx'),
    'utf8',
  );
  const form = readFileSync(
    join(root, 'src/hair/components/expenses/ExpenseForm.tsx'),
    'utf8',
  );
  assert.match(modal, /ExpenseForm/);
  assert.match(form, /createExpenseAction/);
  assert.match(form, /onSaved/);
});

test('createExpenseAction returns success and revalidates expenses path', () => {
  const src = readFileSync(join(root, 'src/hair/actions/expenses.ts'), 'utf8');
  assert.match(src, /revalidatePath\('\/expenses'\)/);
  assert.match(src, /return \{ success: 'Expense recorded\.' \}/);
  assert.doesNotMatch(src, /redirect\(/);
});

test('Quick Actions uses semantic theme tokens not hardcoded accent fills', () => {
  const src = readFileSync(
    join(root, 'src/hair/components/HairQuickActionsMenu.tsx'),
    'utf8',
  );
  assert.match(src, /var\(--fyh-nav-active-bg\)/);
  assert.match(src, /text-fyh-accent/);
  assert.match(src, /var\(--fyh-border-hover\)/);
  assert.doesNotMatch(src, /bg-fyh-forest\/25/);
  assert.doesNotMatch(src, /hover:border-fyh-accent\/45/);
});

test('HairAppHeader passes staffName into Quick Actions', () => {
  const src = readFileSync(join(root, 'src/hair/components/HairAppHeader.tsx'), 'utf8');
  assert.match(src, /<HairQuickActionsMenu staffName=/);
});

test('HairGlobalSearch uses Input with leading-icon padding (not raw fyh-input)', () => {
  const src = readFileSync(join(root, 'src/hair/components/HairGlobalSearch.tsx'), 'utf8');
  assert.match(src, /from '@\/src\/hair\/components\/ui\/input'/);
  assert.match(src, /pl-9/);
  assert.doesNotMatch(src, /fyh-input/);
  assert.match(src, /Search customers, appointments/);
});
