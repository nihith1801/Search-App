import React from 'react';
import styled from 'styled-components';

const CustomInput = ({ value, onChange, onKeyDown, placeholder, autoFocus, inputRef }) => {
  return (
    <StyledWrapper>
      <div className="form-control">
        <input 
          className="input input-alt" 
          placeholder={placeholder || "Search for files..."}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
          ref={inputRef}
          type="text" 
        />
        <span className="input-border input-border-alt" />
      </div>
    </StyledWrapper>
  );
};

const StyledWrapper = styled.div`
  width: 100%;
  
  .input {
    color: #fff;
    font-size: 0.9rem;
    background-color: transparent;
    width: 100%;
    box-sizing: border-box;
    padding-inline: 0.5em;
    padding-block: 0.7em;
    border: none;
    border-bottom: 2px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .input-border {
    position: absolute;
    background: var(--border-after-color);
    width: 0%;
    height: 2px;
    bottom: 0;
    left: 0;
    transition: width 0.3s cubic-bezier(0.6, -0.28, 0.735, 0.045);
  }

  .input:focus {
    outline: none;
  }

  .input:focus + .input-border {
    width: 100%;
  }

  .form-control {
    position: relative;
    width: 100%;
  }

  .input-alt {
    font-size: 1.1rem;
    padding-inline: 1em;
    padding-block: 0.6em;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  }

  .input-border-alt {
    height: 2px;
    background: linear-gradient(90deg, #FF6464 0%, #FFBF59 50%, #47C9FF 100%);
    transition: width 0.4s cubic-bezier(0.42, 0, 0.58, 1.00);
  }

  .input-alt:focus + .input-border-alt {
    width: 100%;
  }
`;

export default CustomInput; 