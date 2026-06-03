import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamFlag, ChatTab } from './App';
import type { ChatMessage, User } from './types';

describe('TeamFlag Component', () => {
  it('should render correct flag for Germany', () => {
    render(<TeamFlag teamName="Germany" size={30} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://flagcdn.com/w40/de.png');
  });

  it('should fallback to default flag emoji for unknown country', () => {
    render(<TeamFlag teamName="Atlantis" />);
    const fallback = screen.getByText('🏳️');
    expect(fallback).toBeInTheDocument();
  });
});

describe('ChatTab Component', () => {
  const mockUser: User = {
    id: 'user-1',
    email: 'user1@example.com',
    username: 'Alice',
    avatarUrl: 'A'
  };

  const mockMessages: ChatMessage[] = [
    {
      id: 'm1',
      groupId: 'group-1',
      text: 'Hello World',
      type: 'chat',
      userId: 'user-2',
      username: 'Bob',
      timestamp: new Date().toISOString()
    },
    {
      id: 'm2',
      groupId: 'group-1',
      text: 'How is it going?',
      type: 'chat',
      userId: 'user-1',
      username: 'Alice',
      timestamp: new Date().toISOString()
    }
  ];

  it('should render messages correctly', () => {
    const handleSendMessage = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatTab
        messages={mockMessages}
        onSendMessage={handleSendMessage}
        currentUser={mockUser}
        klipyApiKey=""
      />
    );

    expect(screen.getByText('Hello World')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('should trigger onSendMessage when text is submitted', () => {
    const handleSendMessage = vi.fn().mockResolvedValue(undefined);
    render(
      <ChatTab
        messages={mockMessages}
        onSendMessage={handleSendMessage}
        currentUser={mockUser}
        klipyApiKey=""
      />
    );

    const input = screen.getByPlaceholderText('Message the league...');
    const form = input.closest('form');

    fireEvent.change(input, { target: { value: 'My new message' } });
    expect(input).toHaveValue('My new message');

    if (form) {
      fireEvent.submit(form);
    }
    expect(handleSendMessage).toHaveBeenCalledWith('My new message', 'chat');
  });
});
