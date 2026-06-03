import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamFlag, ChatTab, isWinnerPredictionWindowOpen, getMatchDateTime } from './App';
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

describe('Winner Prediction Logic Helpers', () => {
  it('should parse match date and time correctly', () => {
    const match = { date: '2026-06-11', kickoffTime: '20:00' } as any;
    const dt = getMatchDateTime(match);
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getMonth()).toBe(5); // June
    expect(dt.getDate()).toBe(11);
    expect(dt.getHours()).toBe(20);
    expect(dt.getMinutes()).toBe(0);
  });

  it('should allow prediction before first match kickoff', () => {
    const mockMatches = [
      { id: 'm-1', date: '2026-06-11', kickoffTime: '20:00', matchday: 1, status: 'scheduled' },
      { id: 'm-73', date: '2026-06-28', kickoffTime: '20:00', matchday: 4, status: 'scheduled' }
    ] as any[];
    const currentSimTime = new Date(2026, 5, 11, 19, 0); // 1 hour before kickoff
    expect(isWinnerPredictionWindowOpen(mockMatches, currentSimTime)).toBe(true);
  });

  it('should be open during group stage matches', () => {
    const mockMatches = [
      { id: 'm-1', date: '2026-06-11', kickoffTime: '20:00', matchday: 1, status: 'finished' },
      { id: 'm-2', date: '2026-06-12', kickoffTime: '20:00', matchday: 1, status: 'scheduled' },
      { id: 'm-73', date: '2026-06-28', kickoffTime: '20:00', matchday: 4, status: 'scheduled' }
    ] as any[];
    const currentSimTime = new Date(2026, 5, 11, 22, 0); // after m-1 kickoff
    expect(isWinnerPredictionWindowOpen(mockMatches, currentSimTime)).toBe(true);
  });

  it('should lock prediction after round of 32 starts', () => {
    const mockMatches = [
      { id: 'm-1', date: '2026-06-11', kickoffTime: '20:00', matchday: 1, status: 'finished' },
      { id: 'm-73', date: '2026-06-28', kickoffTime: '20:00', matchday: 4, status: 'scheduled' }
    ] as any[];
    const currentSimTime = new Date(2026, 5, 29, 10, 0); // after R32 kickoff
    expect(isWinnerPredictionWindowOpen(mockMatches, currentSimTime)).toBe(false);
  });
});

