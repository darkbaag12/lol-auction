'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
import { useWebSocket } from '../../hooks/useWebSocket';
import { Tournament, TeamResponse, PlayerResponse, AuctionRound, BidResponse, POSITION_LABELS, TIER_COLORS } from '../../lib/types';
import { Suspense } from 'react';

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
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [startingPrice, setStartingPrice] = useState(0);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [bidAmount, setBidAmount] = useState(0);
  const [error, setError] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  const [resolvedTournamentId, setResolvedTournamentId] = useState<number | null>(tournamentId || null);
  const { connected, lastMessage, sendBid } = useWebSocket(resolvedTournamentId || null);

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
        setBidAmount(round.currentPrice + (t.bidUnit || 5));
        const bids = await api.getBidHistory(round.roundId) as BidResponse[];
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
        setBidAmount(data.startingPrice + (tournament?.bidUnit || 5));
        setError('');
        break;
      case 'NEW_BID':
        setBidHistory((prev) => [data, ...prev]);
        setActiveRound((prev) => prev ? {
          ...prev,
          currentPrice: data.amount,
          highestBidderTeam: data.teamName
        } : null);
        setBidAmount(data.amount + (tournament?.bidUnit || 5));
        break;
      case 'ROUND_SOLD':
      case 'ROUND_UNSOLD':
        setActiveRound(null);
        setBidHistory([]);
        fetchData();
        break;
    }
  }, [lastMessage]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [bidHistory, activeRound]);

  const updateBidAmount = (valueOrUpdater: number | ((prev: number) => number)) => {
    setBidAmount(prev => {
      let nextVal = typeof valueOrUpdater === 'function' ? valueOrUpdater(prev) : valueOrUpdater;
      
      // Auto-cap the point based on captain's remaining points
      if (role === 'CAPTAIN' && myTeamId) {
        const myTeam = teams.find(t => t.id === myTeamId);
        if (myTeam && nextVal > myTeam.remainingPoints) {
          nextVal = myTeam.remainingPoints;
        }
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
    sendBid(activeRound.roundId, teamToBid, bidAmount);
  };

  const handleClose = async () => {
    if (!activeRound) return;
    try {
      await api.closeAuction(activeRound.roundId);
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

  if (!resolvedTournamentId) {
    return <div style={{ height: '100vh', background: 'var(--bg-primary)' }}></div>;
  }

  const freshPlayers = players.filter(p => p.status === 'AVAILABLE');
  const unsoldPlayers = players.filter(p => p.status === 'UNSOLD');
  const isReAuctionPhase = freshPlayers.length === 0 && unsoldPlayers.length > 0;
  const currentPool = isReAuctionPhase ? unsoldPlayers : freshPlayers;

  const handleRandomSelect = () => {
    if (currentPool.length === 0) return;
    const randomIndex = Math.floor(Math.random() * currentPool.length);
    setSelectedPlayerId(currentPool[randomIndex].id);
  };

  return (
    <div className="auction-layout-wrapper">
      {/* Sidebar: Teams Grid */}
      <div className="auction-sidebar">
        {teams.map((team) => (
          <div key={team.id} className="team-card-horizontal">
            <div className="team-card-horizontal-header">
              <h3>{team.name} <span style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>({team.captainName})</span></h3>
              <div className="points">잔여 포인트: <span style={{color: 'var(--gold)'}}>{team.remainingPoints} pt</span></div>
            </div>
            <div className="team-card-roster-row">
              {team.members.map((member) => (
                <div key={member.playerId} className="roster-cell">
                   <div className="player-pic">
                    {member.summonerName.charAt(0)}
                  </div>
                  <span className="player-name" style={{marginTop: '4px'}}>{member.summonerName}</span>
                </div>
              ))}
              {Array.from({ length: team.remainingSlots }).map((_, i) => (
                <div key={`empty-${i}`} className="roster-cell">
                  <div className="player-pic" style={{background: 'rgba(255,255,255,0.05)', border: '1px dashed var(--border)'}}>
                    ?
                  </div>
                  <span className="player-name" style={{color: 'var(--text-muted)', marginTop: '4px'}}>빈 슬롯</span>
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
              <div className="avatar-large" style={{ borderColor: TIER_COLORS[activeRound.player.tier] || 'var(--border)' }}>
                {activeRound.player.summonerName.charAt(0)}
              </div>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '8px' }}>
                {activeRound.player.name}
              </h2>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="badge badge-tier" style={{
                  backgroundColor: `${TIER_COLORS[activeRound.player.tier] || '#666'}22`,
                  color: TIER_COLORS[activeRound.player.tier] || '#999',
                  border: `1px solid ${TIER_COLORS[activeRound.player.tier] || '#666'}44`,
                  padding: '4px 12px', fontSize: '0.85rem'
                }}>
                  {activeRound.player.tier}
                </span>
                <span className="badge badge-position" style={{ padding: '4px 12px', fontSize: '0.85rem' }}>
                  {POSITION_LABELS[activeRound.player.mainPosition]}
                </span>
              </div>
            </div>

            {/* Mid: Terminal Log Window */}
            <div className="terminal-log-window">
              <div className="terminal-log-window-header">
                경매 로그 <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} style={{marginLeft: '8px'}}></span>
              </div>
              <div className="log-line highlight">
                {POSITION_LABELS[activeRound.player.mainPosition]} - {activeRound.player.name} 경매 시작 ({activeRound.currentPrice}P)
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
                <button className="btn-quick-bid" onClick={() => updateBidAmount(b => b + 5)}>+5</button>
                <button className="btn-quick-bid" onClick={() => updateBidAmount(b => b + 10)}>+10</button>
                <button className="btn-quick-bid" onClick={() => updateBidAmount(b => b + 50)}>+50</button>
                <button className="btn-quick-bid" onClick={() => updateBidAmount(b => b + 100)}>+100</button>
                
                <div className="bid-input-container" style={{ margin: '0 8px' }}>
                  <input type="number" className="bid-input" value={bidAmount} onChange={(e) => updateBidAmount(Number(e.target.value))} />
                  <span>P</span>
                </div>

                <button 
                  className="btn-submit-bid"
                  onClick={handlePlaceBid}
                  disabled={
                    !(role === 'CAPTAIN' ? myTeamId : selectedTeamId) || 
                    bidAmount <= (activeRound.currentPrice)
                  }
                >
                  입찰 ({bidAmount}P)
                </button>
              </div>

              {role === 'HOST' && (
                <div className="host-controls-group">
                  <button className="btn-host">순서 섞기</button>
                  <button className="btn-host">경매리셋</button>
                  <button className="btn-host success" onClick={handleClose}>낙찰</button>
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
                    <label>대상 선수</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select className="input" value={selectedPlayerId || ''} onChange={(e) => setSelectedPlayerId(Number(e.target.value))} style={{ flex: 1 }}>
                        <option value="">선수 선택</option>
                        {currentPool.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.summonerName} ({p.tier} - {POSITION_LABELS[p.mainPosition] || p.mainPosition}) [신입: {p.isNewMember ? 'O' : 'X'}]
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
        <div className="right-sidebar-section">
          <h4>대기 명단</h4>
          <div className="vertical-player-list">
            {freshPlayers.map((p, index) => (
              <div key={p.id} className="player-list-item">
                <div className="player-list-avatar">
                  {p.summonerName.charAt(0)}
                </div>
                <div className="player-list-info">
                  <span className="player-list-name">{p.summonerName}</span>
                  <span className="player-list-pos">{POSITION_LABELS[p.mainPosition]?.substring(0, 3) || '?'}</span>
                </div>
              </div>
            ))}
            {freshPlayers.length === 0 && <div style={{ padding: '16px', color: 'var(--text-muted)', textAlign: 'center' }}>없음</div>}
          </div>
        </div>
        <div className="right-sidebar-section">
          <h4>유찰 명단</h4>
          <div className="vertical-player-list">
            {unsoldPlayers.map((p, index) => (
              <div key={p.id} className="player-list-item" style={{ opacity: 0.8 }}>
                <div className="player-list-avatar">
                  {p.summonerName.charAt(0)}
                </div>
                <div className="player-list-info">
                  <span className="player-list-name">{p.summonerName}</span>
                  <span className="player-list-pos">{POSITION_LABELS[p.mainPosition]?.substring(0, 3) || '?'}</span>
                </div>
              </div>
            ))}
            {unsoldPlayers.length === 0 && <div style={{ padding: '16px', color: 'var(--text-muted)', textAlign: 'center' }}>없음</div>}
          </div>
        </div>
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
