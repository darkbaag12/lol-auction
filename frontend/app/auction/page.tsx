'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
import { useWebSocket } from '../../hooks/useWebSocket';
import { Tournament, TeamResponse, PlayerResponse, AuctionRound, BidResponse, POSITION_LABELS, TIER_COLORS } from '../../lib/types';
import { Suspense } from 'react';

export interface ChatMessage {
  id: string; // generated client-side for keys
  senderName: string;
  message: string;
  isMe: boolean;
  timestamp: string;
}

function AuctionContent() {
  const searchParams = useSearchParams();
  const tournamentId = Number(searchParams.get('tournamentId') || '0');
  const role = searchParams.get('role') as 'HOST' | 'CAPTAIN' | null;
  const myTeamId = Number(searchParams.get('teamId')) || null;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<TeamResponse[]>([]);
  const [players, setPlayers] = useState<PlayerResponse[]>([]);
  const [activeRound, setActiveRound] = useState<AuctionRound | null>(null);
  const [bidHistory, setBidHistory] = useState<BidResponse[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showAllTeams, setShowAllTeams] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const getFormattedTier = (tier?: string, rankDivision?: string, lp?: number) => {
    if (!tier || tier === 'UNRANKED') return 'UNRANKED';
    if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
      return `${tier} ${lp ?? 0}`;
    }
    return `${tier} ${rankDivision ?? ''}`.trim();
  };
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [startingPrice, setStartingPrice] = useState(0);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [bidAmount, setBidAmount] = useState<number | string>(0);
  const [error, setError] = useState('');
  const [showTiebreaker, setShowTiebreaker] = useState(false);
  const [tiedTeams, setTiedTeams] = useState<TeamResponse[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [chatPosition, setChatPosition] = useState({ x: 0, y: 0 });
  const [isDraggingChat, setIsDraggingChat] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const [poolFilter, setPoolFilter] = useState<'ALL' | 'HIGH' | 'LOW'>('ALL');

  const logEndRef = useRef<HTMLDivElement>(null);
  const isInputFocusedRef = useRef(false);

  useEffect(() => {
    if (selectedPlayerId && players.length > 0) {
      const p = players.find(pl => pl.id === selectedPlayerId);
      if (p) {
        setStartingPrice(p.status === 'AVAILABLE' ? (p.startingScore ?? 0) : 0);
      }
    }
  }, [selectedPlayerId, players]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChatDragStart = (e: React.MouseEvent) => {
    setIsDraggingChat(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: chatPosition.x,
      initialY: chatPosition.y
    };
  };

  useEffect(() => {
    const handleDragMove = (e: MouseEvent) => {
      if (!isDraggingChat) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      
      let nextX = dragStartRef.current.initialX + dx;
      let nextY = dragStartRef.current.initialY + dy;
      
      // Right edge clamping
      if (nextX > 400) nextX = 400;
      // Left edge clamping (approx via window width)
      if (nextX < -(window.innerWidth - 720)) nextX = -(window.innerWidth - 720);
      
      // Bottom edge clamping
      if (nextY > 24) nextY = 24;
      // Top edge clamping (approx via window height)
      if (nextY < -(window.innerHeight - 424)) nextY = -(window.innerHeight - 424);
      
      setChatPosition({ x: nextX, y: nextY });
    };
    const handleDragEnd = () => setIsDraggingChat(false);

    if (isDraggingChat) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
    }
    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDraggingChat]);

  const [resolvedTournamentId, setResolvedTournamentId] = useState<number | null>(tournamentId || null);
  const { connected, lastMessage, sendBid, sendChatMessage } = useWebSocket(
    resolvedTournamentId || null, 
    role, 
    myTeamId, 
    (errMsg) => {
      alert(errMsg);
      window.location.href = '/';
    }
  );

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !resolvedTournamentId) return;
    sendChatMessage(resolvedTournamentId, myTeamId, chatInput.trim());
    setChatInput('');
  };

  const fetchData = async () => {
    try {
      let tId = resolvedTournamentId;
      if (!tId) {
        const latestTournament = await api.getLatestTournament() as Tournament;
        if (latestTournament) {
          tId = latestTournament.id;
          setResolvedTournamentId(tId);
        } else {
          window.location.href = '/';
          return;
        }
      }

      const [t, tm, pl] = await Promise.all([
        api.getTournament(tId) as Promise<Tournament>,
        api.getTeams(tId) as Promise<TeamResponse[]>,
        api.getPlayers(tId) as Promise<PlayerResponse[]>,
      ]);
      setTournament(t);
      setTeams(tm);
      setPlayers(pl);

      const round = await api.getActiveRound(tId) as AuctionRound | null;
      if (round) {
        setActiveRound(round);
        const bids = await api.getBidHistory(round.roundId) as BidResponse[];
        setBidAmount(bids.length > 0 ? round.currentPrice : round.startingPrice);
        setBidHistory(bids);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => { fetchData(); }, [resolvedTournamentId]);

  useEffect(() => {
    if (!lastMessage) return;
    const { type, data } = lastMessage as { type: string; data: any };

    switch (type) {
      case 'ROUND_START':
        setActiveRound(data);
        setBidHistory([]);
        setBidAmount(data.startingPrice);
        setError('');
        break;
      case 'NEW_BID':
        setBidHistory((prev) => [data, ...prev]);
        setActiveRound((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            currentPrice: data.amount,
            highestBidderTeam: data.teamName
          };
        });
        
        if (data.teamsPoints) {
          setTeams(prevTeams => prevTeams.map(t => {
            const updatedPoints = data.teamsPoints[String(t.id)];
            if (updatedPoints !== undefined) {
              return { ...t, remainingPoints: updatedPoints };
            }
            return t;
          }));
        }
        break;
      case 'ROUND_SOLD':
      case 'ROUND_UNSOLD':
        setActiveRound(null);
        setBidHistory([]);
        fetchData();
        break;
      case 'BID_ROLLBACK':
        fetchData(); // Refetch the bids and round state
        break;
      case 'CHAT':
        setChatMessages((prev) => [
          ...prev, 
          {
            id: Date.now().toString() + Math.random().toString(),
            senderName: data.senderName,
            message: data.message,
            isMe: data.teamId === myTeamId,
            timestamp: data.timestamp
          }
        ]);
        break;
    }
  }, [lastMessage, myTeamId]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bidHistory, activeRound]);

  const updateBidAmount = (valueOrUpdater: number | ((prev: number) => number)) => {
    setBidAmount(prev => {
      const currentPrev = typeof prev === 'string' ? (prev === '-' || prev === '' ? 0 : Number(prev)) : prev;
      let nextVal = typeof valueOrUpdater === 'function' ? valueOrUpdater(currentPrev) : valueOrUpdater;
      
      const targetTeamId = role === 'CAPTAIN' ? myTeamId : selectedTeamId;
      const targetTeam = teams.find(t => t.id === targetTeamId);
      
      let effectiveMax = activeRound?.maxPrice != null ? activeRound.maxPrice : Infinity;
      if (targetTeam) {
        effectiveMax = Math.min(effectiveMax, targetTeam.remainingPoints);
      }
      
      if (effectiveMax !== Infinity && nextVal > effectiveMax) {
        return effectiveMax;
      }
      return nextVal;
    });
  };

  const handleStartAuction = async () => {
    if (!selectedPlayerId) return;
    setError('');
    try {
      await api.startAuction(resolvedTournamentId!, { playerId: selectedPlayerId, startingPrice });
      setSelectedPlayerId(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePlaceBid = () => {
    if (!activeRound) return;
    const teamToBid = role === 'CAPTAIN' ? myTeamId : selectedTeamId;
    if (!teamToBid) return;
    
    const finalAmount = typeof bidAmount === 'string' ? (bidAmount === '-' || bidAmount === '' ? 0 : Number(bidAmount)) : bidAmount;
    sendBid(activeRound.roundId, teamToBid, finalAmount);
  };

  const handleClose = async (explicitWinningTeamId?: number) => {
    if (!activeRound) return;
    
    // Check for ties at max price
    if (!explicitWinningTeamId && activeRound.maxPrice != null && activeRound.currentPrice === activeRound.maxPrice) {
      // Fetch fresh bid history from server to ensure we have ALL bids
      const serverBids = await api.getBidHistory(activeRound.roundId) as BidResponse[];
      const topBids = serverBids.filter(b => b.amount === activeRound.maxPrice);
      const uniqueTopTeamIds = Array.from(new Set(topBids.map(b => b.teamId)));
      
      if (uniqueTopTeamIds.length > 1) {
        setTiedTeams(uniqueTopTeamIds.map(id => teams.find(t => t.id === id)).filter(Boolean) as TeamResponse[]);
        setShowTiebreaker(true);
        return;
      }
    }

    try {
      setShowTiebreaker(false);
      await api.closeAuction(activeRound.roundId, explicitWinningTeamId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePass = async () => {
    if (!activeRound) return;
    try {
      await api.passAuction(activeRound.roundId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRollbackLastBid = async () => {
    if (!activeRound || bidHistory.length === 0) return;
    if (!window.confirm('가장 최근 입찰을 취소하시겠습니까?')) return;
    try {
      await api.rollbackLastBid(activeRound.roundId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!resolvedTournamentId) {
    return <div style={{ height: '100vh', background: 'var(--bg-primary)' }}></div>;
  }

  const freshPlayers = players.filter(p => p.status === 'AVAILABLE' && (searchTerm === '' || p.name.includes(searchTerm) || p.summonerName.includes(searchTerm)));
  const unsoldPlayers = players.filter(p => p.status === 'UNSOLD' && (searchTerm === '' || p.name.includes(searchTerm) || p.summonerName.includes(searchTerm)));

  const HIGH_TIERS = ["DIAMOND", "ASCENDANT", "IMMORTAL", "RADIANT", "MASTER", "GRANDMASTER", "CHALLENGER"];
  const isHighTier = (tier: string) => HIGH_TIERS.includes(tier);

  const filteredFreshPlayers = freshPlayers.filter(p => poolFilter === 'ALL' || (poolFilter === 'HIGH' ? isHighTier(p.tier) : !isHighTier(p.tier)));
  const filteredUnsoldPlayers = unsoldPlayers.filter(p => poolFilter === 'ALL' || (poolFilter === 'HIGH' ? isHighTier(p.tier) : !isHighTier(p.tier)));
  const isReAuctionPhase = filteredFreshPlayers.length === 0 && filteredUnsoldPlayers.length > 0;
  
  const currentPool = isReAuctionPhase ? filteredUnsoldPlayers : filteredFreshPlayers;

  const freshHigh = freshPlayers.filter(p => isHighTier(p.tier));
  const freshLow = freshPlayers.filter(p => !isHighTier(p.tier));
  const unsoldHigh = unsoldPlayers.filter(p => isHighTier(p.tier));
  const unsoldLow = unsoldPlayers.filter(p => !isHighTier(p.tier));

  const handleRandomSelect = () => {
    if (currentPool.length === 0) return;
    const randomIndex = Math.floor(Math.random() * currentPool.length);
    setSelectedPlayerId(currentPool[randomIndex].id);
  };

  return (
    <div className="auction-layout-wrapper">
      {/* Sidebar: Teams Grid */}
      <div className="auction-sidebar">
        <button 
          className="btn btn-outline" 
          onClick={() => setShowAllTeams(true)}
          style={{ width: '100%', padding: '12px', marginBottom: '8px', borderStyle: 'dashed', color: 'var(--text-primary)' }}
        >
          👁️ 전체 팀 구성 보기
        </button>
        {teams.map((team) => (
          <div key={team.id} className="team-card-horizontal">
            <div className="team-card-horizontal-header">
              <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {team.name} <span style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>({team.captainName})</span>
              </h3>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div className="points" style={{ fontSize: '0.95rem' }}>
                  잔여: <span style={{color: 'var(--gold)', fontWeight: 800}}>{team.remainingPoints} pt</span>
                </div>
              </div>
            </div>
            <div className="team-card-roster-list" style={{ marginTop: '12px' }}>
              {team.members.map((member) => {
                const playerRecord = players.find(p => p.id === member.playerId);
                const displayName = playerRecord?.name || member.summonerName;
                const showSummonerName = displayName !== member.summonerName;
                
                return (
                  <div key={member.playerId} className="roster-list-item">
                    <div className="player-pic">
                      {member.summonerName?.charAt(0) || '?'}
                    </div>
                    <div className="player-info">
                      <div className="player-name-row">
                        <span className="player-name">{displayName}</span>
                        {member.tier && (
                          <span style={{ fontSize: '0.65rem', color: TIER_COLORS[member.tier] || 'var(--text-muted)', fontWeight: 800, border: `1px solid ${TIER_COLORS[member.tier]}`, borderRadius: '4px', padding: '2px 6px' }}>
                            {getFormattedTier(member.tier, playerRecord?.rankDivision, playerRecord?.lp)}
                          </span>
                        )}
                      </div>
                      {showSummonerName && (
                        <span className="summoner-name">@{member.summonerName}</span>
                      )}
                    </div>
                    <div className="bid-info">
                      <span className="bid-label">WINNING BID</span>
                      <span className="bid-price">{member.purchasePrice} pt</span>
                    </div>
                  </div>
                );
              })}
              {Array.from({ length: team.remainingSlots }).map((_, i) => (
                <div key={`empty-${i}`} className="roster-list-item" style={{ opacity: 0.5 }}>
                  <div className="player-pic" style={{ borderStyle: 'dashed' }}>
                    ?
                  </div>
                  <div className="player-info">
                    <div className="player-name-row">
                      <span className="player-name" style={{ color: 'var(--text-muted)' }}>빈 슬롯</span>
                    </div>
                  </div>
                  <div className="bid-info"></div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Main Area: Active Round or Waiting Screen */}
      <div className="auction-main">
        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px', textAlign: 'center' }}>{error}</div>}

        {activeRound ? (
          <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* Top: Current Player Profile */}
            <div className="auction-target-profile animate-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: '32px', marginBottom: '16px' }}>
                <div className="avatar-large" style={{ borderColor: TIER_COLORS[activeRound.player.tier] || 'var(--border)', margin: 0 }}>
                  {activeRound.player.summonerName?.charAt(0) || '?'}
                </div>
                {activeRound.player.resolution && (
                  <div style={{ 
                    fontStyle: 'italic', 
                    color: 'var(--text-secondary)', 
                    maxWidth: '400px', 
                    lineHeight: '1.5',
                    fontSize: '1.1rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '12px 20px',
                    borderRadius: '8px',
                    borderLeft: '4px solid var(--accent)'
                  }}>
                    "{activeRound.player.resolution}"
                  </div>
                )}
              </div>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                {activeRound.player.name}
                {activeRound.player.isNewMember && (
                  <span style={{ fontSize: '1.2rem', color: 'var(--success)', border: '1px solid var(--success)', padding: '2px 8px', borderRadius: '4px' }}>신입</span>
                )}
              </h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="badge badge-tier" style={{
                  backgroundColor: `${TIER_COLORS[activeRound.player.tier] || '#666'}22`,
                  color: TIER_COLORS[activeRound.player.tier] || '#999',
                  border: `1px solid ${TIER_COLORS[activeRound.player.tier] || '#666'}44`,
                  padding: '4px 12px', fontSize: '0.85rem'
                }}>
                  {getFormattedTier(activeRound.player.tier, activeRound.player.rankDivision, activeRound.player.lp)}
                </span>
                <span className="badge badge-position" style={{ padding: '4px 12px', fontSize: '0.85rem' }}>
                  {POSITION_LABELS[activeRound.player.mainPosition]}
                </span>
                {activeRound.player.mostChampions && activeRound.player.mostChampions !== '없음' && activeRound.player.mostChampions !== '-' && (
                  <span className="badge" style={{ padding: '4px 12px', fontSize: '0.85rem', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                    주 캐릭터: {activeRound.player.mostChampions}
                  </span>
                )}
              </div>
            </div>

            {/* Mid: Terminal Log Window */}
            <div className="terminal-log-window">
              <div className="terminal-log-window-header">
                경매 로그 <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} style={{marginLeft: '8px'}}></span>
              </div>
              <div className="log-line highlight">
                {POSITION_LABELS[activeRound.player.mainPosition] || activeRound.player.mainPosition} - {activeRound.player.name} 경매 시작 ({activeRound.startingPrice}P)
              </div>
              {[...bidHistory].reverse().map((bid, i) => (
                <div key={bid.bidId || i} className="log-line">
                  [{bid.teamName}] 입찰 <span style={{color: 'var(--gold)', fontWeight: 'bold'}}>{bid.amount}P</span> (입찰자: {bid.teamName})
                </div>
              ))}
              <div ref={logEndRef} />
            </div>

            {/* Bottom: Bid Controls panel */}
            <div className="auction-controls-panel">
              <div className="team-chip-group">
                {teams.map(t => (
                  <div 
                    key={t.id} 
                    className={`team-chip ${
                      role === 'CAPTAIN' ? (myTeamId === t.id ? 'active' : 'disabled') : 
                      (selectedTeamId === t.id ? 'active' : '')
                    }`}
                    onClick={() => role === 'HOST' && setSelectedTeamId(t.id)}
                  >
                    {t.name}
                  </div>
                ))}
              </div>

              <div className="quick-bid-group">
                <button className="btn-quick-bid" onClick={() => updateBidAmount(0)}>0</button>
                <button className="btn-quick-bid" onClick={() => updateBidAmount(b => b + 1)}>+1</button>
                <button className="btn-quick-bid" onClick={() => updateBidAmount(b => b + 5)}>+5</button>
                <button className="btn-quick-bid" onClick={() => updateBidAmount(b => b + 10)}>+10</button>
                <button className="btn-quick-bid" onClick={() => updateBidAmount(b => b + 50)}>+50</button>
                
                <div className="bid-input-container" style={{ margin: '0 8px' }}>
                  <input 
                    type="text" 
                    inputMode="numeric" 
                    className="bid-input" 
                    value={bidAmount} 
                    onFocus={() => { isInputFocusedRef.current = true; }}
                    onBlur={() => { isInputFocusedRef.current = false; }}
                    onChange={(e) => {
                      const val = e.target.value;
                      const sanitized = val.replace(/(?!^)-/g, '').replace(/[^-0-9]/g, '');
                      if (sanitized === '-' || sanitized === '') {
                        setBidAmount(sanitized);
                      } else {
                        const parsed = parseInt(sanitized, 10);
                        if (!isNaN(parsed)) {
                          updateBidAmount(parsed);
                        }
                      }
                    }} 
                  />
                  <span>P</span>
                </div>

                {(() => {
                  const targetTeamId = role === 'CAPTAIN' ? myTeamId : selectedTeamId;
                  const targetTeamName = teams.find(t => t.id === targetTeamId)?.name;
                  const currentBidValue = typeof bidAmount === 'string' ? (bidAmount === '-' || bidAmount === '' ? 0 : Number(bidAmount)) : bidAmount;
                  
                  const isHighestBidder = activeRound.highestBidderTeam && targetTeamName === activeRound.highestBidderTeam && !(activeRound.maxPrice != null && activeRound.currentPrice === activeRound.maxPrice);
                  const alreadyBiddedMax = activeRound.maxPrice != null && currentBidValue === activeRound.maxPrice && bidHistory.some(b => b.teamId === targetTeamId && b.amount === activeRound.maxPrice);
                  const isInitialBid = bidHistory.length === 0 && currentBidValue === activeRound.currentPrice;
                  const isInvalidAmount = currentBidValue <= activeRound.currentPrice && !(activeRound.maxPrice != null && currentBidValue === activeRound.maxPrice) && !isInitialBid;

                  return (
                    <button 
                      className="btn-submit-bid"
                      onClick={handlePlaceBid}
                      disabled={Boolean(!targetTeamId || isInvalidAmount || alreadyBiddedMax || isHighestBidder)}
                    >
                      {isHighestBidder ? '최고가 입찰자' : alreadyBiddedMax ? '상한가 입찰 완료' : `입찰 (${bidAmount}P)`}
                    </button>
                  );
                })()}
              </div>

              {role === 'HOST' && (
                <div className="host-controls-group">
                  <button className="btn-host" onClick={handleRollbackLastBid} disabled={bidHistory.length === 0}>입찰 취소</button>
                  <button className="btn-host">순서 섞기</button>
                  <button className="btn-host">경매리셋</button>
                  <button className="btn-host success" onClick={() => handleClose()}>낙찰</button>
                  <button className="btn-host danger" onClick={handlePass}>유찰</button>
                </div>
              )}
            </div>
          </div>
        ) : role === 'HOST' ? (
          <div style={{ maxWidth: '600px', margin: '0 auto', width: '100%', paddingTop: '48px' }}>
            <div className="card">
              <div className="card-header">
                <h2>🎯 새 경매 시작</h2>
              </div>
              {currentPool.length === 0 ? (
                <div className="empty-state">
                  <p>{players.length === 0 ? '경매 가능한 선수가 없습니다.' : '모든 선수 경매가 종료되었습니다.'}</p>
                </div>
              ) : (
                <>
                  {isReAuctionPhase && (
                    <div style={{ background: 'var(--danger)', color: 'white', padding: '8px', borderRadius: '4px', textAlign: 'center', marginBottom: '16px', fontWeight: 'bold' }}>
                      🔥 유찰자 추가 경매가 진행 중입니다 🔥
                    </div>
                  )}
                  <div className="input-group">
                    <label>풀 필터 설정</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      <button className={`btn ${poolFilter === 'ALL' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPoolFilter('ALL')} style={{flex: 1}}>전체</button>
                      <button className={`btn ${poolFilter === 'HIGH' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPoolFilter('HIGH')} style={{flex: 1}}>다이아 이상</button>
                      <button className={`btn ${poolFilter === 'LOW' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPoolFilter('LOW')} style={{flex: 1}}>다이아 미만</button>
                    </div>
                    <label>대상 선수 ({currentPool.length}명)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select className="input" value={selectedPlayerId || ''} onChange={(e) => setSelectedPlayerId(Number(e.target.value))} style={{ flex: 1 }}>
                        <option value="">선수 선택</option>
                        {currentPool.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.summonerName} ({p.tier} - {POSITION_LABELS[p.mainPosition] || p.mainPosition})
                          </option>
                        ))}
                      </select>
                      <button className="btn btn-secondary" onClick={handleRandomSelect} style={{ whiteSpace: 'nowrap' }}>
                        🎲 랜덤 뽑기
                      </button>
                    </div>
                  </div>
                  <div className="input-group">
                    <label>시작 가격 (기본 0)</label>
                    <input className="input" type="number" value={startingPrice} onChange={(e) => setStartingPrice(Number(e.target.value))} />
                  </div>
                  <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: '16px' }} onClick={handleStartAuction} disabled={!selectedPlayerId}>
                    🚀 경매 시작
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>⏳</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>경매 대기 중...</h2>
            <p style={{ marginTop: '8px' }}>호스트가 다음 선수를 올릴 때까지 기다려주세요.</p>
          </div>
        )}
      </div>

      {/* Right Sidebar: Player Pools */}
      <div className="auction-right-sidebar">
        <div style={{ marginBottom: '16px' }}>
          <input 
            type="text" 
            className="input" 
            placeholder="이름으로 선수 검색..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
          />
        </div>
        <div className="right-sidebar-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>대기 명단 <span style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>{freshPlayers.length}명</span></h4>
          </div>
          <div className="vertical-player-list" style={{ minHeight: '100px', height: '40vh', overflowY: 'auto', marginTop: '12px' }}>
            {freshPlayers.map((p) => (
              <div key={p.id} className="player-list-item">
                <div className="player-list-avatar" style={{ borderColor: TIER_COLORS[p.tier] || 'var(--border)' }}>{p.summonerName?.charAt(0) || '?'}</div>
                <div className="player-list-info" style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="player-list-name">{p.name} {p.isNewMember && <span style={{ marginLeft: '4px', fontSize: '0.7rem', color: 'var(--success)', border: '1px solid var(--success)', padding: '0 4px', borderRadius: '4px' }}>신입</span>}</span>
                    {p.name !== p.summonerName && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.summonerName}</span>}
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: TIER_COLORS[p.tier] || 'var(--text-muted)' }}>{getFormattedTier(p.tier, p.rankDivision, p.lp)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span className="badge-position" style={{ padding: '2px 6px', fontSize: '0.7rem', borderRadius: '4px' }}>주: {POSITION_LABELS[p.mainPosition] || p.mainPosition || '-'}</span>
                    <span className="badge-position" style={{ padding: '2px 6px', fontSize: '0.7rem', borderRadius: '4px', opacity: 0.7 }}>부: {POSITION_LABELS[p.subPosition] || p.subPosition || '-'}</span>
                    {p.startingScore != null && (
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gold)', marginLeft: '4px' }}>{p.startingScore} pt</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {freshPlayers.length === 0 && <div style={{ padding: '16px', color: 'var(--text-muted)', textAlign: 'center' }}>없음</div>}
          </div>
        </div>

        <div className="right-sidebar-section" style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
            <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>유찰 명단 <span style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>{unsoldPlayers.length}명</span></h4>
          </div>
          <div className="vertical-player-list" style={{ minHeight: '100px', height: '30vh', overflowY: 'auto', marginTop: '12px' }}>
            {unsoldPlayers.map((p) => (
              <div key={p.id} className="player-list-item" style={{ opacity: 0.8 }}>
                <div className="player-list-avatar" style={{ borderColor: TIER_COLORS[p.tier] || 'var(--border)' }}>{p.summonerName?.charAt(0) || '?'}</div>
                <div className="player-list-info" style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span className="player-list-name">{p.name}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: TIER_COLORS[p.tier] || 'var(--text-muted)' }}>{getFormattedTier(p.tier, p.rankDivision, p.lp)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <span className="badge-position" style={{ padding: '2px 6px', fontSize: '0.7rem', borderRadius: '4px', filter: 'grayscale(50%)' }}>주: {POSITION_LABELS[p.mainPosition] || p.mainPosition || '-'}</span>
                    <span className="badge-position" style={{ padding: '2px 6px', fontSize: '0.7rem', borderRadius: '4px', opacity: 0.7, filter: 'grayscale(50%)' }}>부: {POSITION_LABELS[p.subPosition] || p.subPosition || '-'}</span>
                  </div>
                </div>
              </div>
            ))}
            {unsoldPlayers.length === 0 && <div style={{ padding: '16px', color: 'var(--text-muted)', textAlign: 'center' }}>없음</div>}
          </div>
        </div>
      </div>

      {/* All Teams Modal */}
      {showAllTeams && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', flexDirection: 'column', padding: '40px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>전체 팀 로스터 현황 ({teams.length}팀)</h2>
            <button 
              className="btn btn-primary"
              onClick={() => setShowAllTeams(false)}
              style={{ fontSize: '1rem', padding: '10px 24px', background: 'var(--danger)', border: 'none' }}
            >
              닫기
            </button>
          </div>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
            gap: '24px',
            alignItems: 'start'
          }}>
            {teams.map((team) => (
              <div key={team.id} className="team-card-horizontal" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                <div className="team-card-header">
                  <h3 className="team-name" style={{ color: 'var(--text-primary)' }}>{team.name} <span className="captain-name" style={{ color: 'var(--text-muted)' }}>({team.captainName})</span></h3>
                  <div className="team-points-rem" style={{ color: 'var(--text-muted)' }}>잔여: <span style={{ color: 'var(--gold)' }}>{team.remainingPoints} pt</span></div>
                </div>
                <div className="team-roster-list">
                  {team.members?.map((member) => {
                    const playerRecord = players.find(p => p.id === member.playerId);
                    const displayName = playerRecord?.name || member.summonerName;
                    const showSummonerName = displayName !== member.summonerName;
                    
                    return (
                      <div key={member.playerId} className="roster-list-item" style={{ background: 'var(--bg-secondary)', padding: '10px', borderRadius: '8px', marginBottom: '8px' }}>
                        <div className="player-pic">
                          {member.summonerName?.charAt(0) || '?'}
                        </div>
                        <div className="player-info" style={{ marginLeft: '12px', flex: 1 }}>
                          <div className="player-name-row" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="player-name" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{displayName}</span>
                            {member.tier && (
                              <span style={{ fontSize: '0.65rem', color: TIER_COLORS[member.tier] || 'var(--text-muted)', fontWeight: 800, border: `1px solid ${TIER_COLORS[member.tier]}`, borderRadius: '4px', padding: '2px 6px' }}>
                                {getFormattedTier(member.tier, playerRecord?.rankDivision, playerRecord?.lp)}
                              </span>
                            )}
                          </div>
                          {showSummonerName && (
                            <span className="summoner-name" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{member.summonerName}</span>
                          )}
                        </div>
                        <div className="bid-info" style={{ textAlign: 'right' }}>
                          <span className="bid-price" style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.9rem' }}>{member.purchasePrice} pt</span>
                        </div>
                      </div>
                    );
                  })}
                  {Array.from({ length: team.remainingSlots }).map((_, i) => (
                    <div key={`empty-${i}`} className="roster-list-item" style={{ opacity: 0.5, background: 'var(--bg-secondary)', padding: '10px', borderRadius: '8px', marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                      <div className="player-pic" style={{ borderStyle: 'dashed' }}>?</div>
                      <div className="player-info" style={{ marginLeft: '12px' }}>
                        <span className="player-name" style={{ color: 'var(--text-muted)' }}>빈 슬롯</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showTiebreaker && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '32px', borderRadius: '12px', minWidth: '400px', textAlign: 'center', border: '1px solid var(--border)' }}>
            <h2 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>🏆 상한가 동률 발생!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              여러 팀이 상한가({activeRound?.maxPrice}P)로 입찰했습니다.<br />
              이 선수를 낙찰시킬 팀을 선택해주세요.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tiedTeams.map(t => (
                <button
                  key={t.id}
                  className="btn btn-primary"
                  onClick={() => handleClose(t.id)}
                  style={{ width: '100%', padding: '16px', justifyContent: 'center', fontSize: '1.1rem' }}
                >
                  {t.name} ({t.captainName})에게 낙찰!
                </button>
              ))}
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => setShowTiebreaker(false)}
              style={{ marginTop: '24px', width: '100%', justifyContent: 'center' }}
            >
              취소 (다시 대기)
            </button>
          </div>
        </div>
      )}

      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '400px',
        transform: `translate(${chatPosition.x}px, ${chatPosition.y}px)`,
        width: '320px',
        height: '400px',
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 50
      }}>
        <div 
          onMouseDown={handleChatDragStart}
          style={{
          padding: '12px 16px',
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: isDraggingChat ? 'grabbing' : 'grab',
          userSelect: 'none'
        }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>💬 팀장 단톡방</h4>
          <div style={{ background: connected ? 'var(--success)' : 'var(--danger)', width: 8, height: 8, borderRadius: '50%' }} />
        </div>
        
        <div style={{ flex: 1, padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {chatMessages.length === 0 && (
            <div style={{ margin: 'auto', color: 'var(--text-muted)', fontSize: '0.8rem' }}>팀장님들과 대화를 시작해보세요!</div>
          )}
          {chatMessages.map(msg => (
            <div key={msg.id} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.isMe ? 'flex-end' : 'flex-start',
              width: '100%'
            }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0 4px 2px 4px' }}>{msg.senderName}</span>
              <div style={{
                background: msg.isMe ? 'var(--accent)' : 'var(--bg-card)',
                color: msg.isMe ? '#000000' : 'var(--text-primary)',
                border: msg.isMe ? 'none' : '1px solid var(--border)',
                padding: '6px 10px',
                borderRadius: '12px',
                borderTopRightRadius: msg.isMe ? '2px' : '12px',
                borderTopLeftRadius: !msg.isMe ? '2px' : '12px',
                maxWidth: '85%',
                wordBreak: 'break-word',
                fontSize: '0.85rem',
                boxShadow: 'var(--shadow-sm)'
              }}>
                {msg.message}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        
        <form onSubmit={handleSendChat} style={{
          display: 'flex',
          padding: '8px',
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border)'
        }}>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={!connected}
            placeholder="메시지 입력..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              padding: '8px',
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              backgroundColor: 'transparent'
            }}
          />
          <button type="submit" disabled={!connected || !chatInput.trim()} style={{
            background: 'var(--accent)',
            color: '#000000',
            border: 'none',
            borderRadius: '4px',
            padding: '0 12px',
            fontWeight: 600,
            cursor: (!connected || !chatInput.trim()) ? 'not-allowed' : 'pointer',
            opacity: (!connected || !chatInput.trim()) ? 0.5 : 1
          }}>
            전송
          </button>
        </form>
      </div>

    </div>
  );
}

export default function AuctionPage() {
  return (
    <Suspense fallback={<div style={{ height: '100vh', background: 'var(--bg-primary)' }}></div>}>
      <AuctionContent />
    </Suspense>
  );
}
