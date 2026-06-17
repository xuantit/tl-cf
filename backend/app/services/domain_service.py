import uuid
from sqlalchemy.orm import Session

from app.core.cloudflare import CloudflareClient
from app.core.security import decrypt_api_token
from app.models.account import Account
from app.models.domain import Domain


def add_domain(db: Session, name: str, account_id: str) -> Domain | None:
    acc = db.query(Account).filter(Account.id == account_id, Account.is_active == True).first()
    if not acc:
        return None
    try:
        token = decrypt_api_token(acc.api_token_encrypted)
        client = CloudflareClient(api_token=token)
        zone = client.create_zone(name=name, account_id=acc.cf_account_id)
        if not zone:
            return None
        
        # Automatically apply default settings for new domains
        zone_id = zone.get("id")
        if zone_id:
            import logging
            # Set SSL mode to "flexible"
            try:
                client.set_ssl_mode(zone_id=zone_id, mode="flexible")
                logging.info(f"Set SSL mode to flexible for zone {zone_id} (domain {name})")
            except Exception as ssl_error:
                logging.warning(f"Failed to set SSL mode for zone {zone_id} (domain {name}): {ssl_error}")
            
            # Apply default cache settings
            try:
                cache_success = client.apply_default_cache_settings(zone_id=zone_id)
                if cache_success:
                    logging.info(f"Applied default cache settings for zone {zone_id} (domain {name})")
                else:
                    logging.warning(f"Some cache settings may have failed for zone {zone_id} (domain {name})")
            except Exception as cache_error:
                logging.warning(f"Failed to apply cache settings for zone {zone_id} (domain {name}): {cache_error}")
            
            # Create default cache rule (if account_id is available)
            try:
                if acc.cf_account_id:
                    cache_rule = client.create_cache_rule(zone_id=zone_id, account_id=acc.cf_account_id, name="cache", ignore_query_string=True)
                    if cache_rule:
                        logging.info(f"Created cache rule 'cache' for zone {zone_id} (domain {name})")
                    else:
                        logging.info(f"Cache rule creation attempted for zone {zone_id} (domain {name}). May require manual setup via dashboard.")
            except Exception as rule_error:
                logging.warning(f"Failed to create cache rule for zone {zone_id} (domain {name}): {rule_error}")
    except ValueError as e:
        # Re-raise ValueError (domain exists, permission errors) with clear message
        raise e
    except Exception as e:
        import logging
        logging.error(f"Failed to create zone {name} for account {acc.name}: {e}")
        return None
    dom = Domain(
        id=str(uuid.uuid4()),
        account_id=account_id,
        name=name,
        zone_id=zone.get("id"),
        status=zone.get("status", "active"),
    )
    db.add(dom)
    db.commit()
    db.refresh(dom)
    return dom


def delete_domain(db: Session, domain_id: str) -> bool:
    dom = db.query(Domain).filter(Domain.id == domain_id).first()
    if not dom:
        return False
    acc = db.query(Account).filter(Account.id == dom.account_id).first()
    if acc and dom.zone_id:
        token = decrypt_api_token(acc.api_token_encrypted)
        client = CloudflareClient(api_token=token)
        client.delete_zone(dom.zone_id)
    db.delete(dom)
    db.commit()
    return True


def get_ssl_mode(db: Session, domain_id: str) -> str | None:
    """Get SSL mode for a domain"""
    dom = db.query(Domain).filter(Domain.id == domain_id).first()
    if not dom or not dom.zone_id:
        return None
    acc = db.query(Account).filter(Account.id == dom.account_id, Account.is_active == True).first()
    if not acc:
        return None
    try:
        token = decrypt_api_token(acc.api_token_encrypted)
        client = CloudflareClient(api_token=token)
        return client.get_ssl_mode(zone_id=dom.zone_id)
    except Exception as e:
        import logging
        logging.error(f"Failed to get SSL mode for domain {dom.name}: {e}")
        return None


def update_ssl_mode(db: Session, domain_id: str, mode: str) -> bool:
    """Update SSL mode for a domain"""
    dom = db.query(Domain).filter(Domain.id == domain_id).first()
    if not dom or not dom.zone_id:
        return False
    acc = db.query(Account).filter(Account.id == dom.account_id, Account.is_active == True).first()
    if not acc:
        return False
    try:
        token = decrypt_api_token(acc.api_token_encrypted)
        client = CloudflareClient(api_token=token)
        return client.set_ssl_mode(zone_id=dom.zone_id, mode=mode)
    except Exception as e:
        import logging
        logging.error(f"Failed to update SSL mode for domain {dom.name}: {e}")
        return False


def apply_default_settings_to_domain(db: Session, domain_id: str) -> dict:
    """
    Apply default settings (SSL mode and cache settings) to an existing domain.
    Returns a dict with success/failure status for each setting.
    """
    import logging
    dom = db.query(Domain).filter(Domain.id == domain_id).first()
    if not dom or not dom.zone_id:
        return {"success": False, "error": "Domain not found or no zone_id"}
    
    acc = db.query(Account).filter(Account.id == dom.account_id, Account.is_active == True).first()
    if not acc:
        return {"success": False, "error": "Account not found or inactive"}
    
    result = {
        "domain_id": domain_id,
        "domain_name": dom.name,
        "ssl_mode": {"success": False, "error": None},
        "cache_settings": {"success": False, "error": None},
        "cache_rule": {"success": False, "error": None},
    }
    
    try:
        token = decrypt_api_token(acc.api_token_encrypted)
        client = CloudflareClient(api_token=token)
        zone_id = dom.zone_id
        
        # Set SSL mode to "flexible"
        try:
            ssl_success = client.set_ssl_mode(zone_id=zone_id, mode="flexible")
            result["ssl_mode"]["success"] = ssl_success
            if not ssl_success:
                result["ssl_mode"]["error"] = "Failed to set SSL mode"
        except Exception as ssl_error:
            result["ssl_mode"]["error"] = str(ssl_error)
            logging.warning(f"Failed to set SSL mode for domain {dom.name}: {ssl_error}")
        
        # Apply default cache settings
        try:
            cache_success = client.apply_default_cache_settings(zone_id=zone_id)
            result["cache_settings"]["success"] = cache_success
            if not cache_success:
                result["cache_settings"]["error"] = "Some cache settings may have failed"
        except Exception as cache_error:
            result["cache_settings"]["error"] = str(cache_error)
            logging.warning(f"Failed to apply cache settings for domain {dom.name}: {cache_error}")
        
        # Create cache rule (if account_id is available)
        try:
            if acc.cf_account_id:
                cache_rule = client.create_cache_rule(zone_id=zone_id, account_id=acc.cf_account_id, name="cache", ignore_query_string=True)
                result["cache_rule"]["success"] = cache_rule is not None
                if not cache_rule:
                    result["cache_rule"]["error"] = "Cache rule creation may require manual setup"
        except Exception as rule_error:
            result["cache_rule"]["error"] = str(rule_error)
            logging.warning(f"Failed to create cache rule for domain {dom.name}: {rule_error}")
        
        result["success"] = result["ssl_mode"]["success"] or result["cache_settings"]["success"]
        return result
    except Exception as e:
        logging.error(f"Failed to apply default settings for domain {dom.name}: {e}")
        return {"success": False, "error": str(e)}


def apply_default_settings_to_all_domains(db: Session, account_id: str | None = None) -> dict:
    """
    Apply default settings to all existing domains.
    If account_id is provided, only apply to domains in that account.
    Returns a summary of results.
    """
    import logging
    q = db.query(Domain)
    if account_id:
        q = q.filter(Domain.account_id == account_id)
    domains = q.filter(Domain.zone_id.isnot(None)).all()
    
    results = {
        "total": len(domains),
        "processed": 0,
        "successful": 0,
        "failed": 0,
        "details": []
    }
    
    for dom in domains:
        result = apply_default_settings_to_domain(db, dom.id)
        results["processed"] += 1
        if result.get("success", False):
            results["successful"] += 1
        else:
            results["failed"] += 1
        results["details"].append(result)
        logging.info(f"Applied default settings to domain {dom.name}: {result.get('success', False)}")
    
    return results
