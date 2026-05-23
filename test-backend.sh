#!/usr/bin/env bash
# Integration test for Tari BaKfar Google Apps Script backend
# Usage: bash test-backend.sh

URL="https://script.google.com/macros/s/AKfycbzWpFmhtMf7uAUlRaI28RRlKPNo3nSjBiEWpO2AVJY7ycDIXqnxgCER4zPr-VGNmx9iMQ/exec"

PASS=0; FAIL=0

post() {
  # POST to Apps Script → 302 → GET to echo URL (browser fetch behavior)
  # Do NOT use -X POST: it forces POST on redirect causing 411/drive-html
  REDIR=$(curl -s --max-time 20 \
    -H "Content-Type: text/plain;charset=utf-8" \
    -d "$1" -D - \
    "$URL" 2>/dev/null | grep -i "^Location:" | tr -d '\r\n' | cut -d' ' -f2)
  [ -z "$REDIR" ] && echo "NO_REDIRECT" && return
  curl -sL --max-time 20 "$REDIR"
}

check() {
  local label="$1" body="$2"
  local ok
  ok=$(echo "$body" | grep -o '"ok":true' | head -1)
  if [ "$ok" = '"ok":true' ]; then
    echo "  ✅  $label"
    PASS=$((PASS+1))
  else
    echo "  ❌  $label"
    echo "      response: $(echo "$body" | head -c 200)"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "══════════════════════════════════════════"
echo "  Tari BaKfar — Backend Integration Tests"
echo "══════════════════════════════════════════"
echo ""

# ── PING ──────────────────────────────────────
echo "[ Ping ]"
R=$(post '{"action":"ping"}')
check "ping" "$R"

# ── EXPENSES ──────────────────────────────────
echo ""
echo "[ Expenses ]"

EXP_ID="test_exp_$(date +%s)"
R=$(post "{\"action\":\"add_expense\",\"payload\":{\"id\":\"$EXP_ID\",\"date\":\"23/05/2026\",\"supplier\":\"ספק בדיקה\",\"total_amount\":117,\"vat_amount\":17,\"amount_before_vat\":100,\"category\":\"ירקות\",\"document_type\":\"חשבונית מס\",\"document_number\":\"1001\",\"notes\":\"בדיקה\",\"image\":\"\"}}")
check "add_expense" "$R"

R=$(post '{"action":"list_expenses"}')
check "list_expenses" "$R"
COUNT=$(echo "$R" | grep -o "\"$EXP_ID\"" | wc -l | tr -d ' ')
if [ "$COUNT" -gt "0" ]; then
  echo "  ✅  expense found in list (id=$EXP_ID)"
  PASS=$((PASS+1))
else
  echo "  ❌  expense NOT found in list"
  FAIL=$((FAIL+1))
fi

R=$(post "{\"action\":\"delete_expense\",\"id\":\"$EXP_ID\"}")
check "delete_expense" "$R"

# ── FIXED ──────────────────────────────────────
echo ""
echo "[ Fixed expenses ]"

FIX_ID="test_fix_$(date +%s)"
R=$(post "{\"action\":\"add_fixed\",\"payload\":{\"id\":\"$FIX_ID\",\"name\":\"שכירות בדיקה\",\"amount\":3000,\"category\":\"שכירות\",\"frequency\":\"חודשי\",\"day\":\"1\",\"supplier\":\"בעל הנכס\",\"notes\":\"בדיקה\",\"active\":true}}")
check "add_fixed" "$R"

R=$(post '{"action":"list_fixed"}')
check "list_fixed" "$R"

R=$(post "{\"action\":\"delete_fixed\",\"id\":\"$FIX_ID\"}")
check "delete_fixed" "$R"

# ── INSTALLMENTS ───────────────────────────────
echo ""
echo "[ Installments ]"

INS_ID="test_ins_$(date +%s)"
R=$(post "{\"action\":\"add_installment\",\"payload\":{\"id\":\"$INS_ID\",\"name\":\"מקרר תעשייתי\",\"total\":12000,\"installments\":12,\"paid\":0,\"first_date\":\"01/01/2026\",\"supplier\":\"ציוד מקצועי בע\\\"מ\",\"notes\":\"בדיקה\"}}")
check "add_installment" "$R"

R=$(post '{"action":"list_installments"}')
check "list_installments" "$R"

R=$(post "{\"action\":\"delete_installment\",\"id\":\"$INS_ID\"}")
check "delete_installment" "$R"

# ── SUMMARY ────────────────────────────────────
echo ""
echo "══════════════════════════════════════════"
TOTAL=$((PASS+FAIL))
echo "  Results: $PASS/$TOTAL passed"
if [ "$FAIL" -eq 0 ]; then
  echo "  🎉 All tests passed — backend is ready!"
else
  echo "  ⚠️  $FAIL test(s) failed — check output above"
fi
echo "══════════════════════════════════════════"
echo ""
