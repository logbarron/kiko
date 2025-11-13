import { logError } from './logger';

export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string
): Promise<boolean> {
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: remoteIp,
      }),
    });
    
    const data = await response.json() as { success: boolean };
    return data.success;
  } catch (error) {
    logError('turnstile/verify', error);
    return false;
  }
}