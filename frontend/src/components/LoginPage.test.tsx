import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { ApiError } from '../api';
import LoginPage from './LoginPage';

vi.mock('../api', async (orig) => ({
  ...(await orig<typeof import('../api')>()),
  requestCode: vi.fn(),
  verifyCode: vi.fn(),
}));
import { requestCode, verifyCode } from '../api';

beforeEach(() => {
  vi.mocked(requestCode).mockReset().mockResolvedValue(undefined);
  vi.mocked(verifyCode).mockReset();
});

async function toCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'user@example.com');
  await user.click(screen.getByRole('button', { name: 'Send code' }));
}

test('email, then code, then onLogin', async () => {
  const u = { id: 1, email: 'user@example.com', roles: ['user'] };
  vi.mocked(verifyCode).mockResolvedValue(u);
  const onLogin = vi.fn();
  const user = userEvent.setup();
  render(<LoginPage onLogin={onLogin} />);

  await toCodeStep(user);
  expect(requestCode).toHaveBeenCalledWith('user@example.com');
  expect(
    await screen.findByText('If the email exists, a code was printed in the backend console.'),
  ).toBeInTheDocument();

  await user.type(screen.getByLabelText('Code'), '123456');
  await user.click(screen.getByRole('button', { name: 'Verify' }));
  expect(verifyCode).toHaveBeenCalledWith('user@example.com', '123456');
  expect(onLogin).toHaveBeenCalledWith(u);
});

test('401 shows an error and does not log in', async () => {
  vi.mocked(verifyCode).mockRejectedValue(new ApiError(401, 'Unauthorized'));
  const onLogin = vi.fn();
  const user = userEvent.setup();
  render(<LoginPage onLogin={onLogin} />);

  await toCodeStep(user);
  await user.type(await screen.findByLabelText('Code'), '000000');
  await user.click(screen.getByRole('button', { name: 'Verify' }));
  expect(await screen.findByText('Invalid or expired code')).toBeInTheDocument();
  expect(onLogin).not.toHaveBeenCalled();
});

test('can go back to change the email', async () => {
  const user = userEvent.setup();
  render(<LoginPage onLogin={vi.fn()} />);
  await toCodeStep(user);
  await user.click(await screen.findByRole('button', { name: 'Change email' }));
  expect(screen.getByLabelText('Email')).toBeInTheDocument();
});
