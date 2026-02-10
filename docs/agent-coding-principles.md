# Agent Coding Principles — Detailed Examples

These examples demonstrate the four principles from `CLAUDE.md`. Each shows what agents commonly do wrong and how to do it right.

---

## 1. Think Before Coding

### Hidden Assumptions

**User**: "Add a feature to export user data"

**Wrong** — silently assumes scope, format, fields:

```python
def export_users(format='json'):
    users = User.query.all()
    if format == 'json':
        with open('users.json', 'w') as f:
            json.dump([u.to_dict() for u in users], f)
    elif format == 'csv':
        with open('users.csv', 'w') as f:
            writer = csv.DictWriter(f, fieldnames=['id', 'email', 'name'])
            writer.writeheader()
            writer.writerows([u.to_dict() for u in users])
```

**Right** — surface assumptions, ask:

```
Before implementing, I need to clarify:

1. **Scope**: Export all users or filtered subset? (privacy implications)
2. **Format**: Download file? Background job? API endpoint?
3. **Fields**: Which user fields? (some might be sensitive)
4. **Volume**: How many users? (affects approach)

Simplest approach: API endpoint returning paginated JSON.
What's your preference?
```

### Multiple Interpretations

**User**: "Make the search faster"

**Wrong** — pick silently, add caching + indexes + async.

**Right** — present the options:

```
"Make the search faster" could mean:

1. Faster response time (add DB indexes, cache) — ~2 hours
2. Handle more concurrent searches (async, connection pooling) — ~4 hours
3. Faster perceived speed (partial results, progressive loading) — ~3 hours

Current search takes ~500ms. Which aspect matters most?
```

---

## 2. Simplicity First

### Over-abstraction

**User**: "Add a function to calculate discount"

**Wrong** — strategy pattern, abstract base classes, dataclasses, config objects (60+ lines):

```python
class DiscountStrategy(ABC):
    @abstractmethod
    def calculate(self, amount: float) -> float: ...

class PercentageDiscount(DiscountStrategy): ...
class FixedDiscount(DiscountStrategy): ...

@dataclass
class DiscountConfig:
    strategy: DiscountStrategy
    min_purchase: float = 0.0
    max_discount: float = float('inf')

class DiscountCalculator: ...
```

**Right** — one function:

```python
def calculate_discount(amount: float, percent: float) -> float:
    return amount * (percent / 100)
```

Add complexity when you *actually* need multiple discount types. Not before.

### Speculative Features

**User**: "Save user preferences to database"

**Wrong** — adds caching, validation, merge strategies, notification system.

**Right** — just save them:

```python
def save_preferences(db, user_id: int, preferences: dict):
    db.execute(
        "UPDATE users SET preferences = ? WHERE id = ?",
        (json.dumps(preferences), user_id)
    )
```

---

## 3. Surgical Changes

### Drive-by Refactoring

**User**: "Fix the bug where empty emails crash the validator"

**Wrong** — also adds docstring, improves email regex, adds username length validation, changes variable names:

```diff
- if not user_data.get('email'):
+ email = user_data.get('email', '').strip()
+ if not email:
      raise ValueError("Email required")
- if '@' not in user_data['email']:
+ if '@' not in email or '.' not in email.split('@')[1]:
      raise ValueError("Invalid email")
+ if len(username) < 3:
+     raise ValueError("Username too short")
```

**Right** — only fix the bug:

```diff
- if not user_data.get('email'):
+ email = user_data.get('email', '')
+ if not email or not email.strip():
      raise ValueError("Email required")
- if '@' not in user_data['email']:
+ if '@' not in email:
      raise ValueError("Invalid email")
```

### Style Drift

**User**: "Add logging to the upload function"

**Wrong** — also changes quote style, adds type hints, adds docstring, restructures boolean logic.

**Right** — add logging, match existing style:

```diff
+ import logging
+ logger = logging.getLogger(__name__)

  def upload_file(file_path, destination):
+     logger.info(f'Starting upload: {file_path}')
      try:
          # ... existing code unchanged ...
          if response.status_code == 200:
+             logger.info(f'Upload successful: {file_path}')
              return True
          else:
+             logger.error(f'Upload failed: {file_path}, status={response.status_code}')
              return False
      except Exception as e:
-         print(f"Error: {e}")
+         logger.exception(f'Upload error: {file_path}')
          return False
```

---

## 4. Goal-Driven Execution

### Vague vs. Verifiable

**User**: "Fix the authentication system"

**Wrong**:
```
I'll fix the authentication system by:
1. Reviewing the code
2. Identifying issues
3. Making improvements
```

**Right**:
```
What specific auth issue? If "users stay logged in after password change":

1. Write test: Change password → verify old session invalidated
   Verify: Test fails (reproduces bug)
2. Implement: Invalidate sessions on password change
   Verify: Test passes
3. Check edge cases: Multiple sessions, concurrent changes
   Verify: Additional tests pass
4. Regression check: Existing auth tests still pass
```

### Multi-Step with Verification

**User**: "Add rate limiting to the API"

**Wrong** — implements Redis, multiple strategies, config system, and monitoring in one 300-line commit.

**Right** — incremental with verification:

```
1. Basic in-memory rate limiting (single endpoint)
   Verify: 100 requests → first 10 succeed, rest get 429

2. Extract to middleware (all endpoints)
   Verify: Rate limits apply to /users and /posts; existing tests pass

3. Redis backend (multi-server)
   Verify: Rate limit persists across restarts

4. Per-endpoint config
   Verify: /search allows 10/min, /users allows 100/min

Each step is independently deployable. Start with step 1?
```

### Test-First Verification

**User**: "The sorting breaks when there are duplicate scores"

**Wrong** — immediately changes sort logic without confirming the bug.

**Right** — reproduce first, then fix:

```python
# 1. Test that reproduces the issue
def test_sort_with_duplicate_scores():
    scores = [
        {'name': 'Alice', 'score': 100},
        {'name': 'Bob', 'score': 100},
        {'name': 'Charlie', 'score': 90},
    ]
    result = sort_scores(scores)
    # Verify: Run 10 times → fails with inconsistent ordering

# 2. Fix with stable sort
def sort_scores(scores):
    return sorted(scores, key=lambda x: (-x['score'], x['name']))
    # Verify: Test passes consistently
```

---

## Anti-Patterns Summary

| Principle | Anti-Pattern | Fix |
|-----------|-------------|-----|
| Think Before Coding | Silently assumes scope, format, fields | List assumptions, ask for clarification |
| Simplicity First | Strategy pattern for a single calculation | One function until complexity is needed |
| Surgical Changes | Reformats quotes, adds type hints while fixing a bug | Only change lines that fix the issue |
| Goal-Driven | "I'll review and improve the code" | "Write test for bug X → make it pass → verify no regressions" |

**Key insight**: The overcomplicated examples aren't obviously wrong — they follow design patterns and best practices. The problem is **timing**: they add complexity before it's needed. Good code solves today's problem simply, not tomorrow's problem prematurely.
