package com.gyeongmae.auction.repository;

import com.gyeongmae.auction.entity.Player;
import com.gyeongmae.auction.entity.Player.PlayerStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PlayerRepository extends JpaRepository<Player, Long> {
    List<Player> findByTournamentId(Long tournamentId);
    List<Player> findByTournamentIdAndStatus(Long tournamentId, PlayerStatus status);
    void deleteByTournamentId(Long tournamentId);
}
