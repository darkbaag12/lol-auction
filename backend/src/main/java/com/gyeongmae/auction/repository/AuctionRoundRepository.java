package com.gyeongmae.auction.repository;

import com.gyeongmae.auction.entity.AuctionRound;
import com.gyeongmae.auction.entity.AuctionRound.AuctionRoundStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AuctionRoundRepository extends JpaRepository<AuctionRound, Long> {
    List<AuctionRound> findByTournamentIdOrderByRoundNumberAsc(Long tournamentId);
    Optional<AuctionRound> findByTournamentIdAndStatus(Long tournamentId, AuctionRoundStatus status);
    int countByTournamentId(Long tournamentId);
    List<AuctionRound> findByWinningTeamId(Long teamId);
}
