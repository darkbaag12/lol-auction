package com.gyeongmae.auction.repository;

import com.gyeongmae.auction.entity.Bid;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BidRepository extends JpaRepository<Bid, Long> {
    List<Bid> findByAuctionRoundIdOrderByBidTimeDesc(Long auctionRoundId);
    List<Bid> findByTeamId(Long teamId);
}
