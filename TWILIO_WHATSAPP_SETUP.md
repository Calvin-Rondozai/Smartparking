# Twilio WhatsApp Booking Setup

This guide will help you set up WhatsApp booking functionality using Twilio.

## What's Implemented

✅ WhatsApp webhook endpoint that handles booking requests  
✅ User identification via phone number  
✅ Slot booking via WhatsApp commands  
✅ Booking status checking  
✅ Same booking flow as mobile app (balance check, LED control, IoT integration)

## Twilio Configuration Steps

### 1. Get Your Twilio Credentials

1. Go to [Twilio Console](https://console.twilio.com/)
2. Sign up or log in
3. Get your **Account SID** and **Auth Token** from the dashboard

### 2. Configure Twilio WhatsApp Sandbox

1. In Twilio Console, go to **Messaging > Try it out > Send a WhatsApp message**
2. You'll see a sandbox number: `+14155238886` (already configured in the code)
3. Click "Join sandbox" from your WhatsApp number to link it
4. Send `join <code-word>` to the sandbox number (e.g., `join my-code`)

### 3. Set Up Webhook URL

1. Go to **Messaging > Settings > WhatsApp Configuration**
2. Set the webhook URL to:

   ```
   https://your-domain.com/api/chatbot/twilio/webhook/
   ```

   **Important**: Replace `your-domain.com` with your actual server domain/IP address.

3. For local testing, use **ngrok** to create a public URL:
   ```bash
   ngrok http 8000
   ```
   Then use the ngrok URL: `https://your-ngrok-url.ngrok.io/api/chatbot/twilio/webhook/`

### 4. Set Environment Variables (Optional)

You can set Twilio credentials as environment variables:

```bash
export TWILIO_ACCOUNT_SID="your_account_sid_here"
export TWILIO_AUTH_TOKEN="your_auth_token_here"
```

Or add them to your `.env` file:

```
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here
```

### 5. Restart Django Server

After configuration:

```bash
cd backend
python manage.py runserver 0.0.0.0:8000
```

## How It Works

### WhatsApp Commands

Users can send commands to `+14155238886`:

| Command  | Description                  | Example  |
| -------- | ---------------------------- | -------- |
| `menu`   | Show available commands      | `menu`   |
| `slots`  | Show available parking slots | `slots`  |
| `book A` | Reserve Slot A               | `book A` |
| `book B` | Reserve Slot B               | `book B` |
| `status` | Check current booking        | `status` |
| `help`   | Get help                     | `help`   |

### Booking Process (Same as Mobile App)

1. User sends `book A` via WhatsApp
2. System checks if slot is available
3. Creates guest user account (if first time)
4. Checks balance (minimum $1 required)
5. Creates booking with 12-hour window
6. Triggers ESP32 LED to blue
7. Billing starts when car is detected by IoT
8. User gets confirmation message

### User Identification

- Users are identified by their WhatsApp phone number
- First-time users get a guest account with $100 credit
- Username format: `whatsapp_<phone_number>`
- Each user maintains their booking history

## Testing

### Local Testing with ngrok

1. Start Django server:

   ```bash
   cd backend
   python manage.py runserver
   ```

2. Start ngrok:

   ```bash
   ngrok http 8000
   ```

3. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

4. Update webhook in Twilio console:

   ```
   https://abc123.ngrok.io/api/chatbot/twilio/webhook/
   ```

5. Send WhatsApp message to `+14155238886`:

   ```
   menu
   ```

6. Try booking:
   ```
   slots
   book A
   status
   ```

## Database Integration

WhatsApp bookings use the same database as the mobile app:

- Same `Booking` model
- Same `ParkingSpot` model
- Same `UserProfile` model
- Same booking statuses and logic

## Security Notes

1. **CSRF Exempt**: The webhook endpoint is CSRF-exempt as required by Twilio
2. **Guest Users**: WhatsApp users get guest accounts (not tied to email)
3. **Balance Check**: Same $1 minimum balance as mobile app
4. **Session Storage**: Phone number stored in session for conversation context

## Troubleshooting

### Issue: "No slots available"

**Solution**: Make sure parking spots exist in your database and are not occupied.

### Issue: "Booking failed"

**Solution**: Check Django logs for errors. Ensure database has proper parking lot data.

### Issue: Webhook not receiving messages

**Solution**:

- Verify ngrok is running and URL is correct
- Check Twilio webhook configuration
- Look at Django logs for incoming requests

### Issue: User already has active booking

**Solution**: User can only have one active booking at a time. Complete or cancel existing booking first.

## Admin Dashboard

WhatsApp bookings appear in the admin dashboard:

- Viewed under "Bookings" section
- Same booking details as mobile app bookings
- Can be managed and resolved by admins

## Next Steps

1. Set up your Twilio account
2. Configure the webhook URL
3. Test with ngrok for local development
4. Deploy to production with proper domain
5. Test booking flow end-to-end

## Contact

For issues, check Django logs and Twilio console logs for detailed error messages.
