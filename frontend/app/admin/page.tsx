'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';
import { Tournament, TeamResponse, PlayerResponse, POSITION_LABELS, TIER_COLORS } from '../../lib/types';
import { Suspense } from 'react';

function AdminContent() {
  const searchParams = useSearchParams();
  const tournamentId = Number(searchParams.get('tournamentId') || '0');
  const isNewMode = searchParams.get('new') === 'true';

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<TeamResponse[]>([]);
  const [players, setPlayers] = useState<PlayerResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Tournament Creation Form
  const [tournamentName, setTournamentName] = useState('');
  const [totalPoints, setTotalPoints] = useState(1000);
  const [bidUnit, setBidUnit] = useState(5);
  const [maxTeamSize, setMaxTeamSize] = useState(5);
  const [isCreating, setIsCreating] = useState(false);

  // Team form
  const [teamName, setTeamName] = useState('');
  const [captainName, setCaptainName] = useState('');
  const [startingPoints, setStartingPoints] = useState<string>('');

  // Player form
  const [playerName, setPlayerName] = useState('');
  const [playerTier, setPlayerTier] = useState('GOLD');
  const [playerDivision, setPlayerDivision] = useState('IV');
  const [playerPosition, setPlayerPosition] = useState('MID');
  const [playerSubPosition, setPlayerSubPosition] = useState('');
  const [playerChampions, setPlayerChampions] = useState('');

  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [error, setError] = useState('');

  // Current resolved tournament ID (from URL or latest)
  const [resolvedTournamentId, setResolvedTournamentId] = useState<number | null>(tournamentId || null);

  // File upload state
  const [isUploading, setIsUploading] = useState(false);

  const fetchData = async () => {
    try {
      let tId = resolvedTournamentId;
      if (!tId) {
        // If ?new=true, don't auto-fetch — keep blank for new tournament creation
        if (isNewMode) {
          setLoading(false);
          return;
        }
        const latestTournament = await api.getLatestTournament() as Tournament;
        if (latestTournament) {
          tId = latestTournament.id;
          setResolvedTournamentId(tId);
        } else {
          setLoading(false);
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [resolvedTournamentId]);

  const handleCreateTournament = async () => {
    if (!tournamentName.trim()) {
      setError('대회명을 입력해주세요.');
      return;
    }
    setIsCreating(true);
    setError('');
    try {
      const result: any = await api.createTournament({
        name: tournamentName,
        totalPoints,
        bidUnit,
        maxTeamSize,
      });
      setResolvedTournamentId(result.id);
      window.location.href = `/admin?tournamentId=${result.id}`;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddTeam = async () => {
    if (!teamName.trim() || !captainName.trim() || !resolvedTournamentId) return;
    try {
      const sp = startingPoints.trim() ? parseInt(startingPoints, 10) : undefined;
      await api.createTeam(resolvedTournamentId, { 
        name: teamName, 
        captainName,
        startingPoints: sp
      });
      setTeamName(''); setCaptainName(''); setStartingPoints(''); setShowAddTeam(false);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteTeam = async (teamId: number) => {
    if (!resolvedTournamentId) return;
    if (!window.confirm('정말 이 팀을 삭제하시겠습니까? (소속된 선수 정보도 함께 삭제될 수 있습니다.)')) return;
    try {
      await api.deleteTeam(resolvedTournamentId, teamId);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddPlayer = async () => {
    if (!playerName.trim() || !resolvedTournamentId) return;
    try {
      await api.createPlayer(resolvedTournamentId, {
        summonerName: playerName,
        tier: playerTier,
        rankDivision: playerDivision,
        lp: 0,
        mainPosition: playerPosition,
        subPosition: playerSubPosition,
        mostChampions: playerChampions,
        profileIconUrl: null,
      });
      setPlayerName(''); setPlayerChampions(''); setShowAddPlayer(false);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !resolvedTournamentId) return;

    setIsUploading(true);
    setError('');
    try {
      await api.importPlayersFromExcel(resolvedTournamentId, file);
      fetchData();
      alert('엑셀 데이터를 성공적으로 불러왔습니다.');
    } catch (err: any) {
      setError(`업로드 실패: ${err.message}`);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteTournament = async () => {
    if (!resolvedTournamentId) return;
    if (!confirm(`'${tournament?.name}' 대회를 삭제하시겠습니까?\n선수, 팀 등 모든 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await (api as any).deleteTournament(resolvedTournamentId);
      alert('대회가 삭제되었습니다.');
      window.location.href = '/';
    } catch (err: any) {
      setError(`삭제 실패: ${err.message}`);
    }
  };

  if (!resolvedTournamentId && !loading) {
    return (
      <div className="container" style={{ marginTop: '48px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="card animate-in">
            <div className="card-header">
              <h2>🏆 새 대회 생성</h2>
            </div>
            
            <div className="input-group">
              <label>대회명</label>
              <input
                className="input"
                placeholder="예: 제1회 자낳대"
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
              />
            </div>

            <div className="grid-3">
              <div className="input-group">
                <label>팀당 포인트</label>
                <input
                  className="input"
                  type="number"
                  value={totalPoints}
                  onChange={(e) => setTotalPoints(Number(e.target.value))}
                />
              </div>
              <div className="input-group">
                <label>입찰 단위</label>
                <input
                  className="input"
                  type="number"
                  value={bidUnit}
                  onChange={(e) => setBidUnit(Number(e.target.value))}
                />
              </div>
              <div className="input-group">
                <label>팀 인원</label>
                <input
                  className="input"
                  type="number"
                  value={maxTeamSize}
                  onChange={(e) => setMaxTeamSize(Number(e.target.value))}
                />
              </div>
            </div>

            {error && (
              <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '12px' }}>{error}</p>
            )}

            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '8px' }}
              onClick={handleCreateTournament}
              disabled={isCreating}
            >
              {isCreating ? '생성 중...' : '🚀 대회 생성'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container">
        <div className="empty-state"><p>로딩 중...</p></div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: '24px' }}>
      <div className="page-header" style={{ position: 'relative' }}>
        <a href="/" className="btn btn-outline btn-sm" style={{ position: 'absolute', left: 0, top: '32px' }}>
          🏠 홈으로
        </a>
        <a href={`/auction?tournamentId=${resolvedTournamentId}&role=HOST`} className="btn btn-primary btn-sm" style={{ position: 'absolute', right: 0, top: '32px' }}>
          🔨 경매장 가기
        </a>
        <h1>⚙️ 대회 관리</h1>
        <p style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {tournament?.name} | 포인트: {tournament?.totalPoints} | 입찰단위: {tournament?.bidUnit} | 팀 인원: {tournament?.maxTeamSize}
          <button
            className="btn btn-sm"
            style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', padding: '4px 10px', fontSize: '0.8rem' }}
            onClick={handleDeleteTournament}
          >
            🗑️ 대회 삭제
          </button>
        </p>
      </div>

      {error && <p style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: '16px' }}>{error}</p>}

      {/* Teams Section */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h2>👥 팀 관리 ({teams.length}팀)</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddTeam(true)}>+ 팀 추가</button>
        </div>

        {teams.length === 0 ? (
          <div className="empty-state"><p>등록된 팀이 없습니다.</p></div>
        ) : (
          <div className="grid-3">
            {teams.map((team) => (
              <div key={team.id} className="card team-panel" style={{ position: 'relative' }}>
                <button 
                  onClick={() => handleDeleteTeam(team.id)} 
                  style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1rem' }}
                  title="팀 삭제"
                >
                  ✖
                </button>
                <h3 style={{ marginBottom: '4px' }}>{team.name}</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  👤 {team.captainName}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
                  <div>
                    <div className="team-points">{team.remainingPoints}</div>
                    <div className="team-points-label">잔여 포인트</div>
                  </div>
                  <span className="badge badge-position">
                    {team.filledSlots}/{team.filledSlots + team.remainingSlots}명
                  </span>
                </div>
                <div className="team-roster">
                  {team.members.map((m) => (
                    <div key={m.playerId} className="roster-slot">
                      <span className="position-icon">{POSITION_LABELS[m.assignedPosition] || m.assignedPosition}</span>
                      <span className="player-name">{m.summonerName}</span>
                      <span className="player-price">{m.purchasePrice}P</span>
                    </div>
                  ))}
                  {Array.from({ length: team.remainingSlots }).map((_, i) => (
                    <div key={`empty-${i}`} className="roster-slot empty">
                      <span className="position-icon">?</span>
                      <span className="player-name" style={{ color: 'var(--text-muted)' }}>빈 슬롯</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Players Section */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h2>🎮 선수 관리 ({players.length}명)</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <label className={`btn btn-secondary btn-sm ${isUploading ? 'loading' : ''}`} style={{ cursor: 'pointer', margin: 0 }}>
              {isUploading ? '업로드 중...' : '엑셀 업로드'}
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                style={{ display: 'none' }} 
                onChange={handleExcelUpload} 
                disabled={isUploading}
              />
            </label>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddPlayer(true)}>+ 선수 추가</button>
          </div>
        </div>

        {players.length === 0 ? (
          <div className="empty-state"><p>등록된 선수가 없습니다.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>성명 (소환사명)</th>
                <th>티어</th>
                <th>포지션</th>
                <th>모스트</th>
                <th>상태</th>
                <th>팀</th>
                <th>낙찰가</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.summonerName}</div>
                  </td>
                  <td>
                    <span className="badge badge-tier" style={{
                      backgroundColor: `${TIER_COLORS[p.tier] || '#666'}22`,
                      color: TIER_COLORS[p.tier] || '#999',
                      border: `1px solid ${TIER_COLORS[p.tier] || '#666'}44`
                    }}>
                      {p.tier} {['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(p.tier) ? `${p.lp || 0}LP` : p.rankDivision}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <span className="badge badge-position">{POSITION_LABELS[p.mainPosition] || p.mainPosition}</span>
                      {p.subPosition && p.subPosition !== '없음' && p.subPosition !== '' && (
                        <span className="badge badge-position" style={{ opacity: 0.7, borderStyle: 'dashed' }}>
                          {POSITION_LABELS[p.subPosition] || p.subPosition}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {p.mostChampions || '-'}
                    <span className={p.isNewMember ? "badge badge-success" : "badge badge-secondary"} style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '2px 6px' }}>
                      신입: {p.isNewMember ? 'O' : 'X'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
                  </td>
                  <td>{p.teamName || '-'}</td>
                  <td style={{ color: 'var(--gold)', fontWeight: 600 }}>{p.soldPrice != null ? `${p.soldPrice}P` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Team Modal */}
      {showAddTeam && (
        <div className="modal-overlay" onClick={() => setShowAddTeam(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>팀 추가</h2>
            <div className="input-group">
              <label>팀명</label>
              <input className="input" placeholder="예: 블루팀" value={teamName}
                onChange={(e) => setTeamName(e.target.value)} />
            </div>
            <div className="input-group">
              <label>팀장 닉네임</label>
              <input className="input" placeholder="예: 스트리머A" value={captainName}
                onChange={(e) => setCaptainName(e.target.value)} />
            </div>
            <div className="input-group">
              <label>초기 포인트 (선택, 기본: 대회설정값)</label>
              <input type="number" className="input" placeholder="예: 1200" value={startingPoints}
                onChange={(e) => setStartingPoints(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowAddTeam(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleAddTeam}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Player Modal */}
      {showAddPlayer && (
        <div className="modal-overlay" onClick={() => setShowAddPlayer(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>선수 추가</h2>
            <div className="input-group">
              <label>소환사명</label>
              <input className="input" placeholder="소환사명" value={playerName}
                onChange={(e) => setPlayerName(e.target.value)} />
            </div>
            <div className="grid-3">
              <div className="input-group">
                <label>티어</label>
                <select className="input" value={playerTier} onChange={(e) => setPlayerTier(e.target.value)}>
                  {Object.keys(TIER_COLORS).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>등급</label>
                <select className="input" value={playerDivision} onChange={(e) => setPlayerDivision(e.target.value)}>
                  {['I', 'II', 'III', 'IV'].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>주 포지션</label>
                <select className="input" value={playerPosition} onChange={(e) => setPlayerPosition(e.target.value)}>
                  {Object.entries(POSITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="input-group">
              <label>부 포지션</label>
              <select className="input" value={playerSubPosition} onChange={(e) => setPlayerSubPosition(e.target.value)}>
                <option value="">없음</option>
                {Object.entries(POSITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>모스트 챔피언</label>
              <input className="input" placeholder="예: 야스오, 제드, 리신" value={playerChampions}
                onChange={(e) => setPlayerChampions(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowAddPlayer(false)}>취소</button>
              <button className="btn btn-primary" onClick={handleAddPlayer}>추가</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="container"><div className="empty-state"><p>로딩 중...</p></div></div>}>
      <AdminContent />
    </Suspense>
  );
}
