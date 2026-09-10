#!/bin/bash
# Runs every phase-8 security runtime check sequentially and saves output.
set -x
cd "$(dirname "$0")"
mkdir -p out
node check1-headers.cjs > out/check1.txt 2>&1
node check2-cookies.cjs > out/check2.txt 2>&1
node check3-xss.cjs > out/check3a.txt 2>&1
node check3b-portal-xss.cjs > out/check3b.txt 2>&1
node check3-pdf.mjs > out/check3-pdf.txt 2>&1
node sr-smtp-stub.cjs 2526 > out/smtp-stub.log 2>&1 &
STUB_PID=$!
sleep 1
node check3c-email.cjs > out/check3c.txt 2>&1
kill $STUB_PID 2>/dev/null
node check4-secrets-settings.cjs > out/check4.txt 2>&1
node check5-errors.cjs > out/check5.txt 2>&1
node check6-session.cjs > out/check6.txt 2>&1
node check6b-pwchange-session.cjs > out/check6b.txt 2>&1
node check8-fileserving.cjs > out/check8.txt 2>&1
node check9-upload-confusion.cjs > out/check9.txt 2>&1
# check7 trips the SHARED loginLimiter (same bucket as /api/login, /api/portal/login,
# /api/portal/forgot, /api/portal/activate) for ~15 min on this IP - run it LAST so it
# doesn't block the loginStaff()/portal-login calls the other check scripts make.
node check7-ratelimit.cjs > out/check7.txt 2>&1
echo "ALL DONE"
