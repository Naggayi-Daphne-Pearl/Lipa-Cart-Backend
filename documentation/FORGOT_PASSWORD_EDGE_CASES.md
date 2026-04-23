# Forgot Password Flow — Edge Cases & Error Handling

This document outlines all edge cases handled in the forgot-password and password reset endpoints, with test scenarios and expected responses.

---

## 1. Forgot Password Endpoint (`/auth/forgot-password`)

### Request Format
```json
POST /auth/forgot-password
{
  "phone": "+256712345678",  // Optional, OR
  "email": "user@example.com" // Optional (at least one required)
}
```

### Edge Cases & Handling

#### 1.1 Missing Both Phone & Email
**Trigger:** Neither `phone` nor `email` provided
```json
{}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Phone number or email is required"
}
```

---

#### 1.2 Invalid Phone Format
**Trigger:** Phone doesn't start with `+256` or wrong length
```json
{
  "phone": "0712345678"  // Missing +256 prefix
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Invalid phone format. Use +256XXXXXXXXX (9 digits after prefix)"
}
```

Valid formats:
- ✅ `+256712345678` (13 chars exactly)
- ✅ `+256701234567`
- ❌ `0712345678` (missing prefix)
- ❌ `+25671234567` (too short)
- ❌ `+2567123456789` (too long)

---

#### 1.3 Invalid Email Format
**Trigger:** Email doesn't match basic email regex
```json
{
  "email": "invalid-email"  // No @ symbol
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Invalid email format"
}
```

Valid formats:
- ✅ `user@example.com`
- ✅ `john.doe+tag@company.co.uk`
- ❌ `user@` (no domain)
- ❌ `@example.com` (no local part)
- ❌ `userexample.com` (no @)

---

#### 1.4 Account Not Found (User Enumeration Prevention)
**Trigger:** Account doesn't exist
```json
{
  "phone": "+256755999999"  // Non-existent account
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "If an account exists with this identifier, you will receive a verification code"
}
```

**Why generic message?** Prevents attackers from discovering valid phone numbers/emails.

---

#### 1.5 Account Deactivated
**Trigger:** User account exists but `is_active = false`
```json
{
  "phone": "+256712345678"  // Valid account, but deactivated
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "This account has been deactivated. Please contact support"
}
```

---

#### 1.6 OAuth-Only Account (No Password)
**Trigger:** User signed up with Google, has no password hash
```json
{
  "email": "user@gmail.com"  // Logged in via Google, no password set
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "This account uses social login. Please sign in with your social provider or contact support"
}
```

---

#### 1.7 Email Channel Without Email on File
**Trigger:** User requests email-based reset but has no email stored
```json
{
  "email": "they-provided-an-email@test.com"  // But their account has no email
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Cannot send reset code to email. Please contact support to add an email address to your account"
}
```

---

#### 1.8 Rate Limiting (30-Second Cooldown)
**Trigger:** User requests OTP, then immediately requests again
```bash
# Request 1 - Success
curl -X POST http://localhost:1337/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"phone": "+256712345678"}'

# Response
{
  "success": true,
  "message": "Verification code sent to your phone via SMS",
  "deliveredVia": "sms"
}

# Request 2 (within 30 seconds) - Blocked
curl -X POST http://localhost:1337/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"phone": "+256712345678"}'
```
**Response:** `400 Bad Request`
```json
{
  "message": "Too many requests. Please wait 25 seconds before requesting another code"
}
```

---

#### 1.9 Missing Email Address in System
**Trigger:** Email reset requested but user has no email (checked at backend)
```json
{
  "email": "support@example.com"  // User exists, but their account.email is null
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "No email address associated with this account"
}
```

---

#### 1.10 OTP Delivery Failure
**Trigger:** SMS and Email both fail (edge case in production)
```json
{
  "phone": "+256712345678"
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Unable to send verification code. Please try again or contact support"
}
```

---

## 2. Reset Password Endpoint (`/auth/reset-password`)

### Request Format
```json
POST /auth/reset-password
{
  "phone": "+256712345678",  // Optional, OR
  "email": "user@example.com", // Optional (at least one required)
  "otp": "123456",             // 6-digit code from email/SMS
  "newPassword": "NewPass123"  // At least 6 chars
}
```

### Edge Cases & Handling

#### 2.1 Missing Required Fields

**Case A:** Missing phone/email
```json
{
  "otp": "123456",
  "newPassword": "NewPass123"
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Phone number or email is required"
}
```

**Case B:** Missing OTP
```json
{
  "phone": "+256712345678",
  "newPassword": "NewPass123"
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Verification code is required"
}
```

**Case C:** Missing new password
```json
{
  "phone": "+256712345678",
  "otp": "123456"
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "New password is required"
}
```

---

#### 2.2 Invalid Phone Format
**Trigger:** Phone doesn't match `+256XXXXXXXXX`
```json
{
  "phone": "712345678",  // Missing +256
  "otp": "123456",
  "newPassword": "NewPass123"
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Invalid phone format"
}
```

---

#### 2.3 Invalid OTP Format
**Trigger:** OTP is not exactly 6 digits
```json
{
  "phone": "+256712345678",
  "otp": "12345",  // Only 5 digits
  "newPassword": "NewPass123"
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Verification code must be 6 digits"
}
```

Valid formats:
- ✅ `123456` (6 digits)
- ❌ `12345` (5 digits)
- ❌ `1234567` (7 digits)
- ❌ `12345a` (contains letter)

---

#### 2.4 Password Too Short
**Trigger:** Password < 6 characters
```json
{
  "phone": "+256712345678",
  "otp": "123456",
  "newPassword": "Pass1"  // Only 5 chars
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Password must be at least 6 characters"
}
```

---

#### 2.5 Password Too Long
**Trigger:** Password > 128 characters
```json
{
  "phone": "+256712345678",
  "otp": "123456",
  "newPassword": "Aaa..." // 200+ chars
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Password must be less than 128 characters"
}
```

---

#### 2.6 Password With Leading/Trailing Spaces
**Trigger:** Password has spaces at start/end
```json
{
  "phone": "+256712345678",
  "otp": "123456",
  "newPassword": " Password123"  // Space at start
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Password cannot have leading or trailing spaces"
}
```

---

#### 2.7 OTP Not Found
**Trigger:** OTP was never generated for this account
```json
{
  "phone": "+256712345678",
  "otp": "123456",
  "newPassword": "NewPass123"
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Verification code not found or expired. Please request a new code"
}
```

---

#### 2.8 OTP Expired (> 5 Minutes)
**Trigger:** More than 5 minutes passed since OTP was generated
```json
{
  "phone": "+256712345678",
  "otp": "123456",  // Generated 6 minutes ago
  "newPassword": "NewPass123"
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "Verification code expired. Please request a new code"
}
```

**Note:** Expired OTP is automatically cleared from the system.

---

#### 2.9 Max Attempts Exceeded (5 Failed Attempts)
**Trigger:** User tried wrong OTP 5+ times
```bash
# Attempts 1-4: Wrong code
curl -X POST http://localhost:1337/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"phone": "+256712345678", "otp": "000000", "newPassword": "Pass123"}'
# Response: 401
# Remaining attempts: 4

# Attempt 5: Wrong code
curl -X POST http://localhost:1337/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"phone": "+256712345678", "otp": "111111", "newPassword": "Pass123"}'
# Response: 400
```

**After 5 failures:**
```json
{
  "error": "Too many failed attempts. Please request a new verification code"
}
```

---

#### 2.10 Invalid OTP (Incorrect Code)
**Trigger:** OTP doesn't match (but attempts remain)
```json
{
  "phone": "+256712345678",
  "otp": "000000",  // Wrong code
  "newPassword": "NewPass123"
}
```
**Response:** `401 Unauthorized` (on attempts 1-4)
```json
{
  "error": "Invalid verification code",
  "remainingAttempts": 3
}
```

**Last attempt before lockout (attempt 4):**
```json
{
  "error": "Invalid verification code",
  "remainingAttempts": 1
}
```

---

#### 2.11 Account Deactivated at Reset Time
**Trigger:** Account was deactivated between OTP generation and reset
```json
{
  "phone": "+256712345678",  // Account now has is_active=false
  "otp": "123456",
  "newPassword": "NewPass123"
}
```
**Response:** `400 Bad Request`
```json
{
  "message": "This account has been deactivated"
}
```

---

## 3. Success Scenarios

### Successful OTP Request (Forgot Password)
```bash
curl -X POST http://localhost:1337/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com"}'
```
**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Verification code sent to jo***@example.com",
  "deliveredVia": "email",
  "maskedEmail": "jo***@example.com"
}
```

---

### Successful Password Reset
```bash
curl -X POST http://localhost:1337/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "otp": "123456",
    "newPassword": "SecurePass123"
  }'
```
**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Password reset successfully. You can now sign in with your new password"
}
```

After successful reset:
- ✅ OTP is cleared from system (single-use)
- ✅ Password is hashed and stored
- ✅ User can sign in with new password immediately

---

## 4. Test Cases Summary

| # | Scenario | Input | Expected Status | Key Validation |
|---|----------|-------|-----------------|---|
| 1.1 | No phone/email | `{}` | 400 | At least one required |
| 1.2 | Invalid phone | `+25671234567` | 400 | Must be exactly 13 chars |
| 1.3 | Invalid email | `user@` | 400 | Basic email regex |
| 1.4 | Account not found | Non-existent ID | 400 | Generic msg (enumerate safe) |
| 1.5 | Account inactive | Deactivated user | 400 | Check `is_active` flag |
| 1.6 | OAuth-only | Google-signed user | 400 | Check `password` field |
| 1.7 | No email on file | Email channel, null email | 400 | Require delivery address |
| 1.8 | Rate limit | 2 reqs in 30s | 400 | OTP timestamp check |
| 1.9 | Missing email address | User but no email | 400 | Check auth user email |
| 1.10 | Delivery failure | SMS+Email fail | 400 | Verify sent successfully |
| 2.1a | Missing phone/email | Reset with OTP only | 400 | Required field |
| 2.1b | Missing OTP | Reset without code | 400 | Required field |
| 2.1c | Missing password | Reset without password | 400 | Required field |
| 2.2 | Invalid phone | Phone format | 400 | Validate format |
| 2.3 | Invalid OTP | `12345` (5 digits) | 400 | Must be 6 digits |
| 2.4 | Password too short | `Pass1` | 400 | Min 6 chars |
| 2.5 | Password too long | 200+ chars | 400 | Max 128 chars |
| 2.6 | Password spaces | ` Password123` | 400 | No leading/trailing |
| 2.7 | OTP not found | Never generated | 400 | Check existence |
| 2.8 | OTP expired | 6+ minutes old | 400 | Check 5-min window |
| 2.9 | Max attempts | 5+ wrong attempts | 400 | Track attempt count |
| 2.10 | Wrong OTP | Incorrect code | 401 | Crypto comparison |
| 2.11 | Account inactive | Account disabled | 400 | Check `is_active` |

---

## 5. Security Checklist

- ✅ **User Enumeration Prevention:** Account not found uses generic message
- ✅ **Rate Limiting:** 30-second cooldown between OTP requests
- ✅ **Brute Force Protection:** Max 5 failed OTP attempts
- ✅ **OTP Expiry:** 5-minute window, auto-cleared after reset
- ✅ **Single-Use OTP:** Deleted after successful verification
- ✅ **Password Strength:** Min 6 chars, max 128, no leading/trailing spaces
- ✅ **Deactivation Check:** Prevents reset on inactive accounts
- ✅ **OAuth Detection:** Rejects reset for social-only accounts
- ✅ **Email Masking:** Display `jo***@example.com` instead of full email
- ✅ **Email Delivery Verification:** Confirms OTP was sent before returning success
- ✅ **Professional Email Template:** Green branding, security tips, support contact

---

## 6. Frontend Integration Notes

### Forgot Password Flow
1. **Email validation:** Check email format before sending to backend
2. **Rate limit UI:** Disable "Send Code" button for 30 seconds after success
3. **Masking display:** Show masked email returned in response
4. **Error handling:** Display user-friendly errors, exact backend messages
5. **Retry logic:** Handle generic "account not found" message gracefully

### Reset Password Flow
1. **OTP input:** Accept exactly 6 digits, mask display (e.g., `●●●●●●`)
2. **Attempt tracking:** Show remaining attempts when provided in 401 response
3. **Lockout handling:** Prompt user to request new OTP after 5 failed attempts
4. **Expiry warning:** Notify user if OTP approaching 5-minute limit
5. **Success feedback:** Redirect to login after password reset

---

## 7. Deployment Notes

- OTP store is **in-memory** (resets on server restart)
- For production with multiple servers, migrate to Redis/database storage
- Email template requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` in `.env`
- Test email delivery before going live: `curl http://localhost:1337/email/test`

